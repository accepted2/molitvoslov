"""Published public-content snapshots and append-only delta stream.

Only public liturgical data belongs here. Never persist bookmarks, auth users,
private prayers, memorials, or personal files in this feed.
"""
from django.db import models


class OfflineContentSnapshot(models.Model):
    section = models.CharField(max_length=24)
    object_key = models.CharField(max_length=200)
    checksum = models.CharField(max_length=64)
    payload = models.JSONField()
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["section", "object_key"], name="unique_offline_content_object"
            )
        ]
        indexes = [models.Index(fields=["section", "object_key"], name="api_oc_snap_section_idx")]

    def __str__(self):
        return f"{self.section}/{self.object_key}"


class OfflineContentChange(models.Model):
    """The primary key is the monotonically increasing feed cursor."""
    section = models.CharField(max_length=24)
    object_key = models.CharField(max_length=200)
    operation = models.CharField(max_length=8, choices=[("upsert", "Upsert"), ("delete", "Delete")])
    payload = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["section", "object_key"], name="api_oc_change_section_idx")]
        ordering = ["id"]
