from django.db import models


class PublishedContentItem(models.Model):
    """Last published snapshot; publishing is explicit and never runs on GET."""
    scope = models.CharField(max_length=32)
    item_key = models.CharField(max_length=220)
    checksum = models.CharField(max_length=64)
    data = models.JSONField(default=dict)
    class Meta:
        constraints = [models.UniqueConstraint(fields=["scope", "item_key"], name="published_content_item_unique")]


class PublishedContentChange(models.Model):
    """Append-only ordered changes. A revision is the database primary key."""
    scope = models.CharField(max_length=32, db_index=True)
    item_key = models.CharField(max_length=220)
    action = models.CharField(max_length=12)
    data = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        ordering = ["id"]
        indexes = [models.Index(fields=["scope", "id"], name="content_delta_scope_rev")]
