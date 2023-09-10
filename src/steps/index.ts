import { ExecutableStep } from "grafast";
import { User } from "../typeorm/entity/User";
import { Event } from "../typeorm/entity/Event";
import { typeormFind } from "./typeormFind";
import { EventInterest } from "../typeorm/entity/EventInterest";

export function getUser($id: ExecutableStep<any>) {
  return typeormFind(User, "id", $id).single();
}

export function getUpcomingEventIdsForUser($id: ExecutableStep<any>) {
  return typeormFind(EventInterest, "userId", $id);
}

export function getEvent($id: ExecutableStep<any>) {
  return typeormFind(Event, "id", $id).single();
}
