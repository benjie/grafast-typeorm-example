import { Entity, PrimaryColumn, Column, BaseEntity } from "typeorm";

@Entity()
export class Tag extends BaseEntity {
  @PrimaryColumn()
  name: string;

  @Column({ nullable: true })
  description?: string;
}
