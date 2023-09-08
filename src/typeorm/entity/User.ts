import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  BaseEntity,
  OneToMany,
} from "typeorm";
import { EventInterest } from "./EventInterest";
import { Friendship } from "./Friendship";

@Entity()
export class User extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ unique: true })
  username: string;

  @Column("text", { nullable: true })
  avatar?: string;

  @Column({ type: "timestamp", default: "now()" })
  created_at: string;

  @OneToMany(() => EventInterest, (interest) => interest.user)
  eventInterests: EventInterest[];

  @OneToMany(() => Friendship, (friendship) => friendship.user)
  friendships: Friendship[];

  @OneToMany(() => Friendship, (friendship) => friendship.friend)
  reverseFriendships: Friendship[];
}
