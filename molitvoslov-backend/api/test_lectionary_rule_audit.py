from django.test import SimpleTestCase
from api.lectionary_rule_audit import audit_observations, day_rule_keys


class LectionaryRuleAuditTests(SimpleTestCase):
    def test_pascha_offsets(self):
        self.assertEqual(day_rule_keys("2026-04-12")[0], ("pascha_offset", 0))
        self.assertEqual(day_rule_keys("2027-05-02")[0], ("pascha_offset", 0))

    def test_repeated_same_reading_is_evidence_not_approval(self):
        same = [{"kind": "gospel", "title": "Ин.1:1–17", "label": "", "order": 10}]
        result = audit_observations({2026: {"2026-04-12": same},
                                     2027: {"2027-05-02": same}})
        self.assertEqual(result["status"], "DIAGNOSTIC_ONLY_NOT_APPROVED_FOR_IMPORT")
        self.assertTrue(any(r["rule_kind"] == "pascha_offset"
                            for r in result["repeated_matching_rule_slots"]))

    def test_disagreement_is_reported(self):
        a = [{"kind": "gospel", "title": "Ин.1:1–17", "order": 10}]
        b = [{"kind": "gospel", "title": "Мф.1:1–2", "order": 10}]
        result = audit_observations({2026: {"2026-04-12": a},
                                     2027: {"2027-05-02": b}})
        self.assertTrue(any(r["rule_kind"] == "pascha_offset"
                            for r in result["conflicting_rule_slots"]))

    def test_different_year_of_date_is_rejected(self):
        with self.assertRaises(ValueError):
            audit_observations({2025: {"2026-01-01": []}})
