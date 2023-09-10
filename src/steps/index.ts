import { ExecutableStep } from "grafast";
import { User } from "../typeorm/entity/User";
import { Event } from "../typeorm/entity/Event";
import { typeormFind } from "./typeormFind";
import { EventInterest } from "../typeorm/entity/EventInterest";
import { Tag } from "../typeorm/entity/Tag";
import { Venue } from "../typeorm/entity/Venue";

export function getUser($id: ExecutableStep<any>) {
  return typeormFind(User, { id: $id }).single();
}

export function getUpcomingEventIdsForUser($id: ExecutableStep<any>) {
  return typeormFind(EventInterest, { userId: $id });
}

export function getEvent($id: ExecutableStep<any>) {
  return typeormFind(Event, { id: $id }).single();
}

export function getTag($tag: ExecutableStep<any>) {
  return typeormFind(Tag, { tag: $tag }).single();
}

export function getVenue($id: ExecutableStep<any>) {
  return typeormFind(Venue, { id: $id }).single();
}
