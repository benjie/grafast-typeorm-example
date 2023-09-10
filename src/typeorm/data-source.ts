import "reflect-metadata";

import { DataSource } from "typeorm";
import { User } from "./entity/User";
import { Event } from "./entity/Event";
import { EventInterest } from "./entity/EventInterest";
import { Friendship } from "./entity/Friendship";
import { Tag } from "./entity/Tag";
import { Venue } from "./entity/Venue";

export const AppDataSource = new DataSource({
  type: "postgres",
  host: "localhost",
  port: 5432,
  username: "postgres",
  password: "postgres",
  database: "grafast_typeorm",
  synchronize: true,
  logging: true,
  entities: [User, EventInterest, Friendship, Event, Tag, Venue],
});
