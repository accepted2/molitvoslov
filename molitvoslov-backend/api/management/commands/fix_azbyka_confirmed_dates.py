"""Guarded SQLite-only cleanup of user-confirmed 2027 calendar dates.

Jan 6: restore the four distinct Royal Hour service labels for eight passages.
Dec 4: correct only the known malformed Luke reference, if it exists.
Seven already-correct day records are never written.
"""
import uuid
from pathlib import Path
from django.core.management.base import BaseCommand, CommandError
from django.db import connections, transaction
from django.conf import settings
from api.calendar_models import CalendarReading
from api.sqlite_backup import create_sqlite_backup
from api.management.commands.reconcile_azbyka_problem_days import snapshot, sha

JAN="2027-01-06"
DEC="2027-12-04"
EXPECTED=[
 ("apostle","Евр.1:1–12","На 1-м часе"),
 ("gospel","Мф.1:18–25","На 1-м часе"),
 ("apostle","Гал.3:23–29","На 3-м часе"),
 ("gospel","Лк.2:1–20","На 3-м часе"),
 ("apostle","Евр.1:10–2:3","На 6-м часе"),
 ("gospel","Мф.2:1–12","На 6-м часе"),
 ("apostle","Евр.2:11–18","На 9-м часе"),
 ("gospel","Мф.2:13–23","На 9-м часе"),
]
CORRECT="Лк.1:39–49,56"
WRONG={"Лк.1:39–49:56","Лк.1:39-49:56"}


class Command(BaseCommand):
    help="Fix 2027-01-06 Royal Hours labels; correct 2027-12-04 Luke typo only if in SQLite"

    def add_arguments(self,p):
        p.add_argument("--apply",action="store_true")

    def handle(self,*args,**opts):
        if connections["default"].vendor!="sqlite":
            raise CommandError("SQLite-only operation")
        before=snapshot([JAN,DEC])
        by_day={ds:[r for r in before if r["date"]==ds] for ds in (JAN,DEC)}
        jan=sorted(by_day[JAN],key=lambda r:(r["order"],r["id"]))
        if len(jan)!=8 or [(r["kind"],r["title"]) for r in jan]!=[(k,t) for k,t,_ in EXPECTED]:
            raise CommandError("6 January baseline does not match verified eight passages")
        dec=by_day[DEC]
        if len(dec)!=3 or sum(r["title"] in WRONG|{CORRECT} for r in dec)!=1:
            raise CommandError("4 December baseline unexpected; refusing writes")
        for kind,title,label in EXPECTED:
            self.stdout.write(f"06 JAN: {label}: {title}")
        self.stdout.write("04 DEC: "+("already correct, no rewrite" if any(r["title"]==CORRECT for r in dec) else "repair known source typo"))
        if not opts["apply"]:
            self.stdout.write("PREVIEW ONLY. Confirm --apply to update local SQLite.")
            return
        updates=[]
        for r, (_, _, label) in zip(jan,EXPECTED):
            if r["label"]!=label:
                updates.append((r["id"],"label",label))
        for r in dec:
            if r["title"] in WRONG:
                updates.append((r["id"],"title",CORRECT))
        if not updates:
            self.stdout.write("ALREADY CORRECT: No SQLite changes made")
            return
        db=Path(settings.DATABASES["default"]["NAME"])
        backup,digest=create_sqlite_backup(db,Path(settings.BASE_DIR)/"backups"/"sqlite")
        self.stdout.write(f"BACKUP: {backup} SHA256: {digest}")
        baseline=sha(before)
        with transaction.atomic():
            if sha(snapshot([JAN,DEC]))!=baseline:
                raise CommandError("Concurrent changes; rollback")
            for pk,field,value in updates:
                if CalendarReading.objects.filter(pk=pk).update(**{field:value})!=1:
                    raise CommandError("Missing row; rollback")
            after=snapshot([JAN,DEC])
            new_jan=sorted((r for r in after if r["date"]==JAN),key=lambda r:(r["order"],r["id"]))
            if [(r["kind"],r["title"],r["label"]) for r in new_jan]!=EXPECTED:
                raise CommandError("6 January verification failed; rollback")
            new_dec=[r for r in after if r["date"]==DEC]
            if len(new_dec)!=3 or sum(r["title"]==CORRECT for r in new_dec)!=1:
                raise CommandError("4 December verification failed; rollback")
        self.stdout.write(f"APPLIED AND VERIFIED: {len(updates)} field updates, two dates checked; Supabase untouched")
