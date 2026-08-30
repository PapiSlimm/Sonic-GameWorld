# Pub/Sub for the `pubsub` EVENT_BUS_DRIVER. IMPORTANT — read before assuming "one topic per
# EventType": the actual driver (packages/events/src/drivers/pubsub.ts, `PubSubEventBus`)
# publishes every DomainEvent to a SINGLE topic (default `${PUBSUB_TOPIC_PREFIX}-events`) and
# relies on one pull subscription per logical subscriber for fan-out — it does not create or
# publish to a topic per EventType. `google_pubsub_topic.events` below is that real topic; the
# optional per-EventType topics further down exist only for var.create_per_event_type_topics
# (default off) — see variables.tf's description and this directory's README.

resource "google_pubsub_topic" "events" {
  name   = "${var.name_prefix}-events"
  labels = var.labels

  depends_on = [google_project_service.apis]
}

# One pull subscription per subscriber (variables.tf's `pubsub_subscribers`), matching
# `${topic}-${subscriber}` from PubSubEventBus's constructor. Every worker/service must pass a
# distinct `subscriber` value to `createEventBusFromEnv()`/`new PubSubEventBus()` — the driver
# defaults to `'api'` for everyone, which would otherwise collide all subscribers onto one
# subscription (`${prefix}-events-api`) and split events between them instead of fanning them out.
resource "google_pubsub_subscription" "subscribers" {
  for_each = toset(var.pubsub_subscribers)

  name  = "${google_pubsub_topic.events.name}-${each.value}"
  topic = google_pubsub_topic.events.id

  ack_deadline_seconds       = 30
  message_retention_duration = "604800s" # 7 days

  retry_policy {
    minimum_backoff = "5s"
    maximum_backoff = "60s"
  }

  labels = var.labels
}

# ---- Optional: one topic per CONTRACTS.md §7 EventType (off by default — see header note) ----

resource "google_pubsub_topic" "per_event_type" {
  for_each = var.create_per_event_type_topics ? toset(local.event_types) : toset([])

  # e.g. USER_REGISTERED -> gameworld-event-user-registered
  name   = "${var.name_prefix}-event-${lower(replace(each.value, "_", "-"))}"
  labels = var.labels

  depends_on = [google_project_service.apis]
}
