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

    def test_service_labels_preserved_between_apostle_and_gospel(self):
        text=("Субботы: Лит. – Ап.: Гал.3:8–12. Ев.: Лк.13:18–29. "
              "Сщмч.: Лит. – Ап.: Евр.4:14–5:6. Ев.: Мк.9:33–41. "
              "Прав.: Утр. – Мф.6:1–13. Лит. – Ап.: Евр.4:14–5:6. Ев.: Мф.5:14–19. "
              "Рядовое: Лит. – Ап.: Еф.5:1–8. Ев.: Лк.14:1–11.")
        parsed=parse_readings_text(text)
        self.assertEqual([p.label for p in parsed],
                         ["Субботы","Субботы","Сщмч.","Сщмч.",
                          "Прав.","Прав.","Прав.","Ряд.","Ряд."])

    def test_alternative_memorial_label_not_explanatory_prose(self):
        parsed=parse_readings_text(
            "За упокой: 1Кор.15:47–57. Ин.6:35–39. "
            "В служебных Апостоле и Евангелии указаны другие чтения за упокой для Троицкой родительской субботы: "
            "1Сол.4:13–17. Ин.5:24–30.")
        self.assertEqual([p.label for p in parsed],["За упокой"]*4)

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
