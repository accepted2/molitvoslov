"""Smoke tests for public share URLs on the deployment branch."""
from django.test import SimpleTestCase


class PublicShareLandingTests(SimpleTestCase):
    def test_public_bible_link_resolves_with_custom_scheme_target(self):
        response = self.client.get("/api/share/?path=bible%2F1%2F1%2Frst")
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "molitvoslov://bible/1/1/rst")
        self.assertContains(response, "Открыть в приложении")

    def test_psalm_link(self):
        response = self.client.get(
            "/api/share/?path=kathisma%2F4%2F27%2Ftraditional"
        )
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "molitvoslov://kathisma/4/27/traditional")

    def test_private_invitation_landing_never_displays_private_content(self):
        token = "A" * 43
        response = self.client.get("/api/share/?invite=" + token)
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "molitvoslov://shared/" + token)
        self.assertNotContains(response, "health_names")

    def test_invalid_path_is_rejected(self):
        response = self.client.get("/api/share/?path=../../admin")
        self.assertEqual(response.status_code, 400)

    def test_naked_page_does_not_fail_as_404(self):
        response = self.client.get("/api/share/")
        self.assertEqual(response.status_code, 400)
