from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("api", "0046_calendarfeast_editorial_fields")]

    operations = [
        migrations.AddField(model_name="calendarfeast", name="troparion_alternate_title", field=models.TextField(blank=True, default="")),
        migrations.AddField(model_name="calendarfeast", name="troparion_alternate_content", field=models.TextField(blank=True, default="")),
        migrations.AddField(model_name="calendarfeast", name="troparion_alternate_title_uk", field=models.TextField(blank=True, default="")),
        migrations.AddField(model_name="calendarfeast", name="troparion_alternate_content_uk", field=models.TextField(blank=True, default="")),
        migrations.AddField(model_name="calendarfeast", name="troparion_script", field=models.CharField(max_length=10, blank=True, default="civil", choices=[("civil", "Гражданский текст"), ("csl", "Церковнославянский (Ponomar)")])),
        migrations.AddField(model_name="calendarfeast", name="troparion_script_uk", field=models.CharField(max_length=10, blank=True, default="civil", choices=[("civil", "Гражданский текст"), ("csl", "Церковнославянский (Ponomar)")])),
        migrations.AddField(model_name="calendarfeast", name="troparion_alternate_script", field=models.CharField(max_length=10, blank=True, default="civil", choices=[("civil", "Гражданский текст"), ("csl", "Церковнославянский (Ponomar)")])),
        migrations.AddField(model_name="calendarfeast", name="troparion_alternate_script_uk", field=models.CharField(max_length=10, blank=True, default="civil", choices=[("civil", "Гражданский текст"), ("csl", "Церковнославянский (Ponomar)")])),
        migrations.AddField(model_name="calendarfeast", name="kontakion_alternate_title", field=models.TextField(blank=True, default="")),
        migrations.AddField(model_name="calendarfeast", name="kontakion_alternate_content", field=models.TextField(blank=True, default="")),
        migrations.AddField(model_name="calendarfeast", name="kontakion_alternate_title_uk", field=models.TextField(blank=True, default="")),
        migrations.AddField(model_name="calendarfeast", name="kontakion_alternate_content_uk", field=models.TextField(blank=True, default="")),
        migrations.AddField(model_name="calendarfeast", name="kontakion_script", field=models.CharField(max_length=10, blank=True, default="civil", choices=[("civil", "Гражданский текст"), ("csl", "Церковнославянский (Ponomar)")])),
        migrations.AddField(model_name="calendarfeast", name="kontakion_script_uk", field=models.CharField(max_length=10, blank=True, default="civil", choices=[("civil", "Гражданский текст"), ("csl", "Церковнославянский (Ponomar)")])),
        migrations.AddField(model_name="calendarfeast", name="kontakion_alternate_script", field=models.CharField(max_length=10, blank=True, default="civil", choices=[("civil", "Гражданский текст"), ("csl", "Церковнославянский (Ponomar)")])),
        migrations.AddField(model_name="calendarfeast", name="kontakion_alternate_script_uk", field=models.CharField(max_length=10, blank=True, default="civil", choices=[("civil", "Гражданский текст"), ("csl", "Церковнославянский (Ponomar)")])),
    ]
