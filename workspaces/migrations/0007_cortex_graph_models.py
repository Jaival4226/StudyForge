# workspaces/migrations/0007_cortex_graph_models.py

from django.db import migrations, models
import django.db.models.deletion

class Migration(migrations.Migration):
    dependencies = [
        ("workspaces", "0006_conceptmastery"),
    ]

    operations = [
        migrations.CreateModel(
            name='ConceptNode',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('canonical_tag', models.CharField(max_length=255)),
                ('label', models.CharField(max_length=255)),
                ('summary', models.TextField()),
                ('details', models.TextField()),
                ('embedding_id', models.CharField(max_length=255)),
                ('version', models.IntegerField(default=1)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('workspace', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='concept_nodes', to='workspaces.workspace')),
            ],
        ),
        migrations.CreateModel(
            name='NodeResource',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('source_tag', models.CharField(max_length=500)),
                ('title', models.CharField(max_length=500)),
                ('resource_type', models.CharField(max_length=50)),
                ('document', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='node_resources', to='workspaces.document')),
                ('node', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='resources', to='workspaces.conceptnode')),
            ],
        ),
        migrations.CreateModel(
            name='ConceptEvent',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('event_type', models.CharField(choices=[('node_created', 'Node Created'), ('resource_merged', 'Resource Merged'), ('detail_augmented', 'Detail Augmented'), ('edge_inferred', 'Edge Inferred')], max_length=50)),
                ('description', models.TextField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('document', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, to='workspaces.document')),
                ('node', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='events', to='workspaces.conceptnode')),
            ],
        ),
        migrations.CreateModel(
            name='ConceptEdge',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('relationship_type', models.CharField(choices=[('prerequisite', 'Prerequisite'), ('builds_on', 'Builds On'), ('related_to', 'Related To'), ('contrasts_with', 'Contrasts With')], max_length=50)),
                ('label', models.CharField(max_length=255)),
                ('confidence', models.FloatField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('source_node', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='outgoing_edges', to='workspaces.conceptnode')),
                ('target_node', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='incoming_edges', to='workspaces.conceptnode')),
                ('workspace', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='concept_edges', to='workspaces.workspace')),
            ],
        ),
        migrations.AddField(
            model_name='conceptmastery',
            name='concept_node',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='mastery_records', to='workspaces.conceptnode'),
        ),
    ]