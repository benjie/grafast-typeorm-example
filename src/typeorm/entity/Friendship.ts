import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  BaseEntity,
  ManyToOne,
} from "typeorm";
import { User } from "./User";

@Entity()
export class Friendship extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "timestamp", default: "now()" })
  createdAt: string;

  @ManyToOne(() => User, (user) => user.friendships)
  user: User;

  @ManyToOne(() => User, (user) => user.reverseFriendships)
  friend: User;
}
