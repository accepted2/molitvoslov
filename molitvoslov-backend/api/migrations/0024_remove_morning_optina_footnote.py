from django.db import migrations


def remove_optina_footnote(apps, schema_editor):
    PrayerRuleFootnote = apps.get_model(
        'api',
        'PrayerRuleFootnote',
    )

    PrayerRuleFootnote.objects.filter(
        rule__slug='molitvy-utrennie',
        number=2,
        content__icontains=(
            'При желании читается по окончании '
            'утренних молитв'
        ),
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        (
            'api',
            '0023_prune_unlisted_akathists',
        ),
    ]

    operations = [
        migrations.RunPython(
            remove_optina_footnote,
            migrations.RunPython.noop,
        ),
    ]
