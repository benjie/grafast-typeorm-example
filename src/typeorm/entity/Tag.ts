import { Entity, PrimaryColumn, Column, BaseEntity } from "typeorm";

@Entity()
export class Tag extends BaseEntity {
  @PrimaryColumn()
  tag: string;

  @Column({ nullable: true })
  description?: string;
}
