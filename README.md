# Grafast TypeORM Example

**DISCLAIMER**: I don't know TypeORM well, in fact I only tried it for the
first time in this project. This is **NOT** idiomatic TypeORM code!

This project gives an example of expressing simple business logic via plan
resolvers in Gra*fast* and then having powerful step classes with advanced
optimization logic understanding the relationships between the steps
and automatically applying optimizations.

Without any optimizations, this would have involved 8 roundtrips to the
database, and a lot of waiting on previous roundtrips to complete before the
next can start.

However, thanks to the power of Gra*fast*'s planning and execution engine we
can determine the relationship between the steps for an operation and collapse
the waterfall, plus inline some queries, and eradicate others entirely (e.g. no
need to query the tags table).
