import uuid

from django.db import migrations


def fill_saveditem_sync_ids(apps, schema_editor):
    SavedItem = apps.get_model("api", "SavedItem")

    for item in SavedItem.objects.filter(sync_id__isnull=True).iterator():
        item.sync_id = uuid.uuid4()
        item.save(update_fields=["sync_id"])


class Migration(migrations.Migration):

    dependencies = [
        (
            "api",
            "0029_saveditem_deleted_at_saveditem_sync_id_and_more",
        ),
    ]

    operations = [
        migrations.RunPython(
            fill_saveditem_sync_ids,
            migrations.RunPython.noop,
        ),
    ]