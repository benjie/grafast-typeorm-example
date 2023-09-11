import { ExecutableStep, constant, context } from "grafast";
import { User } from "../typeorm/entity/User";
import { Event } from "../typeorm/entity/Event";
import { typeormFind } from "./typeormFind";
import { EventInterest } from "../typeorm/entity/EventInterest";
import { Tag } from "../typeorm/entity/Tag";
import { Venue } from "../typeorm/entity/Venue";

export function getUser($id: ExecutableStep<any>) {
  return typeormFind(User, { id: $id }).single();
}

export function getUpcomingEventsForUser($id: ExecutableStep<any>) {
  return typeormFind(EventInterest, { userId: $id });
}

export function getEvent($id: ExecutableStep<any>) {
  return typeormFind(Event, { id: $id }).single();
}
export function getViewerMetadataForEvent($eventId: ExecutableStep) {
  const $viewerId = context().get("viewerId");
  return typeormFind(EventInterest, {
    eventId: $eventId,
    userId: $viewerId,
  }).single();
}

export function getTag($tagName: ExecutableStep<any>) {
  return typeormFind(Tag, { name: $tagName }).single();
}

export function getVenue($id: ExecutableStep<any>) {
  return typeormFind(Venue, { id: $id }).single();
}

export function getViewerFriendAttendanceForEvent($eventId: ExecutableStep) {
  const $viewerId = context().get("viewerId");

  // Get the attendees of the event (RSVP = 'yes')
  const $list = typeormFind(EventInterest, {
    eventId: $eventId,
    rsvp: constant("yes", true),
  });

  // Join to user then to friendship (reverse)
  $list.innerJoin("EventInterest.user", "user");
  $list.innerJoin("user.reverseFriendships", "friendship");

  // Limit to just the attendees who are friends with the viewer
  $list.where(`friendship."userId" = ${$list.param($viewerId)}::"int4"`);

  return $list;
}
