import { constant, makeGrafastSchema } from "grafast";

export const schema = makeGrafastSchema({
  typeDefs: /* GraphQL */ `
    type Query {
      meaningOfLife: Int
    }
  `,
  plans: {
    Query: {
      meaningOfLife() {
        return constant(42);
      },
    },
  },
});
