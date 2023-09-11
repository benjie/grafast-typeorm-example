import {
  connection,
  makeGrafastSchema,
  ConnectionStep,
  EdgeCapableStep,
  each,
} from "grafast";
import {
  getEvent,
  getTag,
  getUpcomingEventsForUser,
  getUser,
  getVenue,
  getViewerFriendAttendanceForEvent,
  getViewerMetadataForEvent,
} from "./steps";
import { TypeormRecordStep } from "./steps/typeormRecord";
import { Event } from "./typeorm/entity/Event";

export const schema = makeGrafastSchema({
  typeDefs: /* GraphQL */ `
    type Query {
      user(id: Int!): User
    }
    type User {
      id: Int!
      fullName: String!
      username: String!
      picture(size: Int = 50): String!
      upcomingEvents(first: Int = 10): UpcomingEventConnection!
    }
    type UpcomingEventConnection {
      edges: [UpcomingEventEdge!]!
      pageInfo: PageInfo!
    }
    type UpcomingEventEdge {
      cursor: String!
      node: Event
    }
    type Event {
      id: Int!
      name: String!
      viewerRsvp: RsvpStatus
      venue: Venue
      tags: [Tag!]!
      attendingFriendsOfViewer(first: Int = 10): AttendeeConnection!
    }
    type AttendeeConnection {
      edges: [AttendeeEdge!]!
      pageInfo: PageInfo!
    }
    type AttendeeEdge {
      node: User!
      cursor: String!
    }
    type PageInfo {
      hasNextPage: Boolean!
      hasPreviousPage: Boolean!
    }
    type Venue {
      id: Int!
      name: String!
    }
    type Tag {
      id: Int!
      name: String!
    }
    enum RsvpStatus {
      interested
      yes
      no
      maybe
    }
  `,
  plans: {
    Query: {
      user(_, { $id }) {
        return getUser($id);
      },
    },
    User: {
      upcomingEvents($user, { $first }) {
        const $userId = $user.get("id");
        const $list = getUpcomingEventsForUser($userId);
        // TODO: $first
        return connection($list);
      },
    },
    UpcomingEventConnection: {
      edges($connection: ConnectionStep<any, any, any>) {
        return $connection.edges();
      },
    },
    UpcomingEventEdge: {
      node($edge: EdgeCapableStep<any>) {
        const $eventInterest = $edge.node();
        const $eventId = $eventInterest.get("eventId");
        return getEvent($eventId, true);
      },
      cursor($edge: EdgeCapableStep<any>) {
        return $edge.cursor();
      },
    },
    AttendeeConnection: {
      edges($connection: ConnectionStep<any, any, any>) {
        return $connection.edges();
      },
    },
    AttendeeEdge: {
      node($edge: EdgeCapableStep<any>) {
        const $eventInterest = $edge.node();
        const $userId = $eventInterest.get("userId");
        return getUser($userId, true);
      },
      cursor($edge: EdgeCapableStep<any>) {
        return $edge.cursor();
      },
    },
    Event: {
      viewerRsvp($event: TypeormRecordStep<typeof Event>) {
        const $eventId = $event.get("id");
        return getViewerMetadataForEvent($eventId).get("rsvp");
      },
      tags($event: TypeormRecordStep<typeof Event>) {
        return each($event.get("tags"), ($tag) => getTag($tag, true));
      },
      venue($event: TypeormRecordStep<typeof Event>) {
        return getVenue($event.get("venueId"), true);
      },
      attendingFriendsOfViewer($event: TypeormRecordStep<typeof Event>) {
        const $eventId = $event.get("id");
        const $list = getViewerFriendAttendanceForEvent($eventId);
        return connection($list);
      },
    },
  },
});
