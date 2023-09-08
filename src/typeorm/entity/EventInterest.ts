import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  BaseEntity,
  ManyToOne,
} from "typeorm";
import { User } from "./User";
import { Event } from "./Event";

@Entity()
export class EventInterest extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  rsvp?: string;

  @ManyToOne(() => Event, (event) => event.eventInterests)
  event: Event;

  @ManyToOne(() => User, (user) => user.eventInterests)
  user: User;
}
