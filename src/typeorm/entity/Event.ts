import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  BaseEntity,
  OneToMany,
  ManyToOne,
} from "typeorm";
import { EventInterest } from "./EventInterest";
import { Venue } from "./Venue";

@Entity()
export class Event extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ nullable: true })
  description?: string;

  @Column({ type: "timestamp" })
  date: Date;

  @Column({ type: "timestamp", default: "now()" })
  createdAt: string;

  @OneToMany(() => EventInterest, (interest) => interest.event)
  eventInterests: EventInterest[];

  @ManyToOne(() => Venue, (venue) => venue.events)
  venue: Venue;

  @Column({ type: "int" })
  venueId: number;

  @Column("text", { array: true, default: "{}" })
  tags: string[];
}
