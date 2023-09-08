import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  BaseEntity,
  OneToMany,
} from "typeorm";
import { EventInterest } from "./EventInterest";

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

  @Column({ nullable: true })
  location?: string;

  @Column({ type: "timestamp", default: "now()" })
  createdAt: string;

  @OneToMany(() => EventInterest, (interest) => interest.event)
  eventInterests: EventInterest[];
}
