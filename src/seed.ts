import { DataSource } from "typeorm";
import { User } from "./typeorm/entity/User.js";

const seed = `
insert into "user"
  ("fullName", username, picture) values
  ('Alice Grayte', 'AliceTheGreat', 'great.png'),
  ('Bob', 'bob', 'bob.png'),
  ('Charlie', 'charlie', 'charlie.png'),
  ('Diane', 'diane', 'diane.png'),
  ('Eve', 'eve', 'eve.png');

insert into friendship
  ("userId", "friendId") values
  (1, 4),
  (1, 2),
  (2, 3),
  (3, 4),
  (4, 5),
  (5, 1);

insert into venue
  (name) values
  ('San Francisco'),
  ('Southampton'),
  ('London'),
  ('Paris'),
  ('Berlin'),
  ('Windsor'),
  ('San Francisco');

insert into event
  (name, date, "venueId") values
  ('GraphQLConf', '2023-09-14T17:00:00Z',1),
  ('Southampton Digital', '2023-09-28T19:00:00Z',2),
  ('Disco', '2023-10-01T21:00:00Z', 3),
  ('Pride', '2023-10-01T21:00:00Z',4),
  ('BBQ', '2023-10-01T21:00:00Z',5),
  ('Royal Wedding', '2024-05-19T12:00:00Z',6),
  ('GraphQL Summit', '2024-10-01T21:00:00Z',7);

insert into event_interest
  ("eventId", "userId", rsvp) values
  (1, 1, null),
  (1, 2, 'interested'),
  (1, 3, 'yes'),
  (2, 3, 'yes'),
  (2, 4, 'maybe'),
  (3, 4, 'no'),
  (3, 5, 'no'),
  (4, 5, 'no'),
  (4, 1, 'yes'),
  (5, 1, 'yes'),
  (5, 2, null),
  (6, 2, 'maybe'),
  (6, 3, 'yes'),
  (7, 3, 'interested'),
  (7, 4, 'yes');
`;

export async function seedDatabase(db: DataSource) {
  const data = await User.find({ where: { id: 1 } });
  if (data.length < 1) {
    const queryRunner = db.createQueryRunner();
    await queryRunner.manager.query(seed);
  }
}
