# workspaces/mastery_service.py

from datetime import timedelta
from django.utils import timezone
from .models import ConceptMastery

class MasteryService:
    # Days until the next review (1 day, 3 days, 1 week, 2 weeks, 1 month)
    SPACED_LADDER = [1, 3, 7, 14, 30]

    @classmethod
    def record_result(cls, workspace_id, user_id, tag, was_correct):
        mastery, created = ConceptMastery.objects.get_or_create(
            workspace_id=workspace_id,
            user_id=user_id,
            tag=tag,
            defaults={'next_review_due': timezone.now()}
        )

        now = timezone.now()

        if was_correct:
            mastery.correct_count += 1
            step_index = min(max(0, mastery.correct_count - 1), len(cls.SPACED_LADDER) - 1)
            days_to_add = cls.SPACED_LADDER[step_index]
            mastery.next_review_due = now + timedelta(days=days_to_add)
        else:
            # Complete reset on failure
            mastery.incorrect_count += 1
            mastery.correct_count = 0
            mastery.next_review_due = now

        mastery.save()
        return mastery

    @classmethod
    def get_due_concepts(cls, workspace_id, user_id, limit=10):
        now = timezone.now()
        due_records = ConceptMastery.objects.filter(
            workspace_id=workspace_id,
            user_id=user_id,
            next_review_due__lte=now
        ).order_by('next_review_due')[:limit]

        return [record.tag for record in due_records]