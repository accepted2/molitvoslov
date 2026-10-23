"""Regression checks for source completeness and guarded replacement.

Run: python manage.py test api.test_azbyka_reconciliation_safety -v 2
No network and no SQLite writes required.
"""
from django.test import SimpleTestCase
from api.azbyka_calendar_readings import extract_readings_text, parse_readings_text
from api.management.commands.reconcile_azbyka_problem_days import guard_day, unsafe_label


class AzbykaCompletenessTests(SimpleTestCase):
    def test_old_heading_collects_optional_second_paragraph(self):
        html='''<h2>Чтения Священного Писания</h2>
        <p>Ряд.: Евр.1:1–12 (зач. 303). Мк.2:23–3:5 (зач. 10).</p>
        <p>Если служба: Мф.25:1–13 (зач. 104). Гал.3:23–29 (зач. 208).</p>
        <h2>Богослужебные чтения дня</h2><p>Мф.1:1–10.</p>'''
        parsed=parse_readings_text(extract_readings_text(html))
        self.assertEqual(len(parsed),4)
        self.assertEqual(parsed[-1].title,"Гал.3:23–29 (зач. 208)")

    def test_new_groups_with_nested_divs(self):
        html='''<div class="readings-text"><div class="readings-groups">
        <div>Ряд.: Гал.3:23–29 (зач. 208).</div>
        <div>Свт.: Ин.10:9–16 (зач. 36).</div>
        </div></div>'''
        parsed=parse_readings_text(extract_readings_text(html))
        self.assertEqual(len(parsed),2)
        self.assertEqual(parsed[1].title,"Ин.10:9–16 (зач. 36)")

    def test_repeated_assignment_retained(self):
        parsed=parse_readings_text("Ряд.: Лк.6:17–23 (зач. 24). Свт.: Лк.6:17–23 (зач. 24).")
        self.assertEqual(len(parsed),2)


class GuardTests(SimpleTestCase):
    def test_bad_explanatory_label_blocked(self):
        self.assertTrue(unsafe_label(": «Во дни оны, бысть идущим апостолом...»"))

    def test_24_july_protected(self):
        self.assertIn("Protected",guard_day("2026-07-24",[],[]))

    def test_loss_of_passage_blocked(self):
        old=[dict(kind="gospel",label="",title="Мф.27:55–61")]
        new=[dict(kind="gospel",label="",title="Мф.27:55–60")]
        self.assertIn("disappear",guard_day("2026-04-10",old,new))

    def test_loss_of_existing_label_blocked(self):
        old=[dict(kind="gospel",label="Свт.",title="Ин.10:9–16 (зач. 36)")]
        new=[dict(kind="gospel",label="",title="Ин.10:9–16 (зач. 36)")]
        self.assertIn("labels",guard_day("2026-11-24",old,new))
