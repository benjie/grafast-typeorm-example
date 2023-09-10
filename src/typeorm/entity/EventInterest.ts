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

  @Column({ nullable: false })
  eventId: number;

  @ManyToOne(() => User, (user) => user.eventInterests)
  user: User;

  @Column({ nullable: false })
  userId: number;
}
