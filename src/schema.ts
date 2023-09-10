import {
  connection,
  context,
  makeGrafastSchema,
  ConnectionStep,
  EdgeCapableStep,
} from "grafast";
import { getEvent, getUpcomingEventIdsForUser, getUser } from "./steps";
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
      upcomingEvents(first: Int = 10): EventConnection!
    }
    type EventConnection {
      edges: [EventEdge!]!
      pageInfo: PageInfo!
    }
    type EventEdge {
      cursor: String!
      node: Event
    }
    type Event {
      id: Int!
      name: String!
      viewerRsvp: RsvpStatus!
      venue: Venue!
      tags: [Tag!]!
      attendingFriendsOfViewer(first: Int = 10): UserConnection!
    }
    type UserConnection {
      edges: [UserEdge!]!
      pageInfo: PageInfo!
    }
    type UserEdge {
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
        const $list = getUpcomingEventIdsForUser($userId);
        return connection($list);
      },
    },
    EventConnection: {
      edges($connection: ConnectionStep<any, any, any>) {
        return $connection.edges();
      },
    },
    EventEdge: {
      node($edge: EdgeCapableStep<any>) {
        console.log(`${$edge}`);
        const $eventInterest = $edge.node();
        const $eventId = $eventInterest.get("eventId");
        return getEvent($eventId);
      },
      cursor($edge: EdgeCapableStep<any>) {
        return $edge.cursor();
      },
    },
  },
});
