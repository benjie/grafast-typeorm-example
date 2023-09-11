import { inspect } from "node:util";
import {
  ConnectionCapableStep,
  ConnectionStep,
  ExecutableStep,
  GrafastResultsList,
  GrafastValuesList,
  InputStep,
  __ItemStep,
  access,
  constant,
  first,
  PageInfoCapableStep,
  ConstantStep,
  AccessStep,
  FirstStep,
  list,
  object,
  arraysMatch,
  __TrackedValueStep,
} from "grafast";
import { BaseEntity, In } from "typeorm";
import { TypeormRecordStep } from "./typeormRecord";
import { ColumnType } from "typeorm";

const GRAFAST_IDENTS = `grafast_idents`;

/* TODO: does TypeORM have a way to do this natively? */
function typeToPostgres(columnType: ColumnType): string {
  switch (columnType) {
    case "text":
    case "varchar":
    case "char":
    case String:
      return "text";
    case "int":
    case "int2":
    case "int4":
      return "int";
    case "int8":
      return "int8";
    case "float":
    case "float4":
    case Number:
      return "float4";
    case "float8":
      return "float8";
    default: {
      throw new Error(
        `Do not know how to turn type '${columnType}' into a postgres type`,
      );
    }
  }
}

const escapeIdentifier = (identifier: string) =>
  `"${String(identifier).replace(/"/g, '""')}"`;

type AliasSpec =
  | AliasSpecInnerJoin
  | AliasSpecLeftJoinAndMapOne
  | AliasSpecFrom
  | AliasSpecIdentifiers;
type AliasSpecInnerJoin = { type: "innerJoin"; relationName: string };
type AliasSpecLeftJoinAndMapOne = {
  type: "leftJoinAndMapOne";
  entity: typeof BaseEntity;
  relationName: string;
  parentAlias: string;
  condition: string;
};
type AliasSpecFrom = { type: "from" };
type AliasSpecIdentifiers = { type: "identifiers" };

export class TypeormFindStep<TEntity extends typeof BaseEntity>
  extends ExecutableStep<InstanceType<TEntity>[]>
  implements ConnectionCapableStep<TypeormRecordStep<TEntity>, ExecutableStep>
{
  specColumns: Array<[columnName: keyof InstanceType<TEntity>, depId: number]> =
    [];
  aliases: Record<string, AliasSpec>;
  conditions: Array<{ sql: string }> = [];
  params: Record<string, number> = Object.create(null);
  constructor(
    public readonly entity: TEntity,
    spec: Partial<Record<keyof InstanceType<TEntity>, ExecutableStep<any>>>,
    public readonly isGuaranteedToExist = false,
  ) {
    super();
    this.aliases = Object.assign(Object.create(null), {
      [this.entity.name]: { type: "from" },
      [GRAFAST_IDENTS]: { type: "identifiers" },
    });
    for (const [columnName, $column] of Object.entries(spec)) {
      this.specColumns.push([
        columnName as keyof InstanceType<TEntity>,
        this.addDependency($column),
      ]);
    }
  }

  toStringMeta() {
    let str = `${this.entity.name}`;
    if (this.specColumns.length > 0) {
      str += `[${this.specColumns
        .map(([columnName]) => columnName)
        .join(",")}]`;
    }
    const joins = Object.entries(this.aliases).filter(
      (foo): foo is [string, AliasSpecInnerJoin] => foo[1].type === "innerJoin",
    );
    for (const [alias, spec] of joins) {
      str += `,${spec.relationName}`;
    }
    if (this.conditions.length > 0) {
      str += "?";
    }
    return str;
  }

  clone() {
    const $clone = new TypeormFindStep(
      this.entity,
      this.specColumns.reduce((memo, [columnName, depId]) => {
        memo[columnName] = this.getDep(depId);
        return memo;
      }, Object.create(null)),
    );
    for (const [alias, spec] of Object.entries(this.aliases)) {
      switch (spec.type) {
        case "from":
        case "identifiers": {
          // Already handled
          break;
        }
        case "innerJoin": {
          $clone.innerJoin(spec.relationName, alias);
          break;
        }
        case "leftJoinAndMapOne": {
          $clone.leftJoinAndMapOne(
            spec.entity,
            spec.relationName,
            spec.parentAlias,
            alias,
            spec.condition,
          );
          break;
        }
        default: {
          const never: never = spec;
          throw new Error(`Unknown alias type '${never}'`);
        }
      }
    }
    for (const condition of this.conditions) {
      $clone.where(condition.sql);
    }
    for (const [paramName, depId] of Object.entries(this.params)) {
      $clone.param(this.getDep(depId), paramName);
    }

    return $clone;
  }

  connectionDepId: number | null = null;
  connectionClone(
    $connection: ConnectionStep<
      TypeormRecordStep<TEntity>,
      ExecutableStep<any>,
      any,
      any
    >,
  ): ConnectionCapableStep<TypeormRecordStep<TEntity>, ExecutableStep<any>> {
    const $plan = this.clone();
    // In case any errors are raised
    $plan.connectionDepId = $plan.addDependency($connection);
    return $plan;
  }

  async execute(
    count: number,
    values: GrafastValuesList<number | null>[],
  ): Promise<GrafastResultsList<InstanceType<TEntity>[]>> {
    const qb = this.entity.createQueryBuilder();
    const trivial =
      this.specColumns.length === 0 &&
      Object.values(this.params).filter((p) => p >= 0).length === 0;
    if (trivial) {
      /* no filtering required */
    } else {
      const columnNames: string[] = [];
      const propertyNames: string[] = [];
      const columnTypes: string[] = [];
      for (const s of Object.values(this.specColumns)) {
        const col = this.entity
          .getRepository()
          .metadata.columns.find((c) => c.propertyName === s[0]);
        if (!col) {
          throw new Error(
            `Failed to find metadata for column '${String(s[0])}'`,
          );
        }
        propertyNames.push(col.propertyName);
        columnNames.push(escapeIdentifier(col.databaseName));
        columnTypes.push(typeToPostgres(col.type));
      }

      const tuples: any[][] = [];
      const paramsEntries = Object.entries(this.params);
      outerloop: for (let i = 0; i < count; i++) {
        const tuple: any[] = [i];
        for (const [columnName, depId] of this.specColumns) {
          const val = values[depId][i];
          if (val == null) continue outerloop;
          tuple.push(val);
        }
        for (const [paramName, depId] of paramsEntries) {
          const val = values[depId][i];
          tuple.push(val);
        }
        tuples.push(tuple);
      }

      const cteColumns: string[] = [];
      cteColumns.push(`(j->>0)::"int4" as idx`);
      for (let i = 0; i < columnTypes.length; i++) {
        cteColumns.push(
          `(j->>${i + 1})::${escapeIdentifier(columnTypes[i])} AS ident_${i}`,
        );
      }
      for (let i = 0; i < paramsEntries.length; i++) {
        cteColumns.push(
          `(j->>${i + 1 + columnTypes.length}) AS ${escapeIdentifier(
            paramsEntries[i][0],
          )}`,
        );
      }

      qb.addCommonTableExpression(
        `SELECT ${cteColumns.join(", ")} FROM json_array_elements(:json) j`,
        GRAFAST_IDENTS,
      );
      qb.setParameters({
        json: JSON.stringify(tuples),
      });
      qb.innerJoin(
        GRAFAST_IDENTS,
        GRAFAST_IDENTS,
        `${propertyNames
          .map((n, i) => `${escapeIdentifier(n)} = ident_${i}`)
          .join(" AND ")}`,
      );
      qb.addSelect(`${GRAFAST_IDENTS}.idx`, `grafast_idx`);
    }

    for (const [alias, spec] of Object.entries(this.aliases)) {
      switch (spec.type) {
        case "from":
        case "identifiers": {
          // Already handled
          break;
        }
        case "innerJoin": {
          qb.innerJoin(spec.relationName, alias);
          break;
        }
        case "leftJoinAndMapOne": {
          qb.leftJoinAndMapOne(
            spec.relationName,
            spec.relationName,
            alias,
            spec.condition,
          );
          break;
        }
        default: {
          const never: never = spec;
          throw new Error(`Unknown alias type '${never}'`);
        }
      }
    }

    for (const condition of this.conditions) {
      qb.andWhere(condition.sql);
    }

    const rows = await qb.getRawMany();

    if (trivial) {
      // No spec; therefore every call is the same
      const records = rows.map((row) =>
        rowToEntity(this.entity, row, `${this.entity.name}_`, this.aliases),
      ) as InstanceType<TEntity>[];
      return Array.from({ length: count }, () => records);
    } else {
      // Group the rows by their matching spec
      const recordsByIdx: Record<number, InstanceType<TEntity>[]> =
        Object.create(null);
      for (const row of rows) {
        const idx = row.grafast_idx;
        if (!recordsByIdx[idx]) recordsByIdx[idx] = [];
        const record = rowToEntity(
          this.entity,
          row,
          `${this.entity.name}_`,
          this.aliases,
        ) as InstanceType<TEntity>;

        recordsByIdx[idx].push(record as InstanceType<TEntity>);
      }

      // Now populate the results list
      const results = new Array<InstanceType<TEntity>[]>(count);
      for (let idx = 0; idx < count; idx++) {
        results[idx] = recordsByIdx[idx] ?? [];
      }
      return results;
    }
  }

  listItem($item: __ItemStep<InstanceType<TEntity>>) {
    return new TypeormRecordStep(this, $item);
  }

  firstDep: number | null = null;
  setFirst($first: InputStep<any> | ConstantStep<any>) {
    this.firstDep = this.addDependency($first);
  }
  lastDep: number | null = null;
  setLast($last: InputStep<any>) {
    this.lastDep = this.addDependency($last);
  }
  offsetDep: number | null = null;
  setOffset($offset: InputStep<any>) {
    this.offsetDep = this.addDependency($offset);
  }
  beforeDep: number | null = null;
  setBefore($before: InputStep<any>) {
    this.beforeDep = this.addDependency($before);
  }
  afterDep: number | null = null;
  setAfter($after: InputStep<any>) {
    this.afterDep = this.addDependency($after);
  }

  pageInfo(): PageInfoCapableStep {
    throw new Error("Method not implemented.");
  }

  parseCursor(): ExecutableStep<any> | null | undefined {
    throw new Error("Method not implemented.");
  }

  single(): TypeormRecordStep<TEntity> {
    this.setFirst(constant(1));
    return new TypeormRecordStep(this, first(this));
  }

  innerJoin(relationName: string, alias: string) {
    if (this.aliases[alias]) {
      throw new Error("A table with that alias already exists");
    }
    this.aliases[alias] = { type: "innerJoin", relationName };
  }

  leftJoinAndMapOne(
    entity: typeof BaseEntity,
    relationName: string,
    parentAlias: string,
    alias: string,
    condition: string,
  ) {
    if (this.aliases[alias]) {
      throw new Error("A table with that alias already exists");
    }
    this.aliases[alias] = {
      type: "leftJoinAndMapOne",
      entity,
      parentAlias,
      relationName,
      condition,
    };
  }

  where(sql: string) {
    this.conditions.push({ sql });
  }

  param($step: ExecutableStep, key = `param_${$step.id}`) {
    if (this.params[key] !== undefined) {
      // TODO: If it's the same step, then it's fine
      throw new Error("That param name is already used");
    }
    this.params[key] = this.addDependency($step);
    return `${GRAFAST_IDENTS}.${key}`;
  }

  optimize() {
    // If I'm guaranteed to exist and the only columns accessed are in my spec,
    // just return a simple object.
    if (
      this.isGuaranteedToExist &&
      [...this.requestedAttributes].every((attr) =>
        this.specColumns.find(([columnName]) => columnName === attr),
      )
    ) {
      const spec = Object.create(null);
      for (const [columnName, depId] of this.specColumns) {
        spec[columnName as string] = this.getDep(depId);
      }
      return list([object(spec)]);
    }

    // If I have a spec:
    if (this.specColumns.length > 0) {
      // And my spec values are each access steps
      const allSpecSteps = this.specColumns.map(
        ([columnName, depId]) => [columnName, this.getDep(depId)] as const,
      );
      const isRootStep = ($step: ExecutableStep<any>) =>
        $step instanceof __TrackedValueStep || $step instanceof ConstantStep;
      const specSteps = allSpecSteps.filter(([, $step]) => !isRootStep($step));
      if (
        specSteps.length > 0 &&
        specSteps.every(([, s]) => s instanceof AccessStep)
      ) {
        // and the access plan is from a TypeormRecord
        let typeormRecordStep = specSteps[0][1].getDep(0);
        if (
          typeormRecordStep instanceof TypeormRecordStep &&
          specSteps.every(([, s]) => s.getDep(0) === typeormRecordStep)
        ) {
          // and that record is either a list item or the first of a list
          const recordDep = typeormRecordStep.getDep(0);
          if (
            recordDep instanceof FirstStep ||
            recordDep instanceof __ItemStep
          ) {
            // and the parent of that is a TypeormFind
            const parent = recordDep.getDep(0);
            if (parent instanceof TypeormFindStep) {
              const columnNames = this.specColumns.map(
                ([columnName]) => columnName,
              );
              // then if we can find a matching relationship
              const parentEntity = parent.entity as typeof BaseEntity;
              const metadata = parentEntity.getRepository().metadata;
              const sortedColumnNames = [...columnNames].sort() as string[];
              // and the relationship is unique
              const relation = metadata.relationsWithJoinColumns.find(
                (rel) =>
                  rel.inverseEntityMetadata.target === this.entity &&
                  rel.foreignKeys.some((k) =>
                    arraysMatch(
                      [...k.referencedColumnNames].sort(),
                      sortedColumnNames,
                    ),
                  ),
              );
              const allowedJoins = Object.entries(this.aliases).filter(
                (entry): entry is [string, AliasSpecLeftJoinAndMapOne] =>
                  entry[1].type === "leftJoinAndMapOne",
              );
              const disallowedJoins = Object.entries(this.aliases).filter(
                ([, spec]) =>
                  spec.type !== "from" &&
                  spec.type !== "identifiers" &&
                  spec.type !== "leftJoinAndMapOne",
              );
              const allowed = relation && disallowedJoins.length === 0;
              if (allowed) {
                const fk = relation.foreignKeys.find((k) =>
                  arraysMatch(
                    [...k.referencedColumnNames].sort(),
                    sortedColumnNames,
                  ),
                )!;
                const name = relation.propertyName;

                // TODO: if we can change the alias, we'll be able to merge more.
                // Alas, that'd involve rewriting parts of the query?
                const alias = this.entity.name;

                if (!parent.aliases[alias]) {
                  const joinConditions: string[] = [];
                  // First, all the specs
                  for (const [columnName, $step] of allSpecSteps) {
                    if (isRootStep($step)) {
                      joinConditions.push(
                        `${escapeIdentifier(alias)}.${escapeIdentifier(
                          columnName as string,
                        )} = ${parent.param($step)}`,
                      );
                    } else {
                      const idx = fk.referencedColumnNames.indexOf(
                        columnName as string,
                      );
                      const otherCol = fk.columnNames[idx];
                      joinConditions.push(
                        `${escapeIdentifier(alias)}.${escapeIdentifier(
                          columnName as string,
                        )} = ${escapeIdentifier(
                          parent.entity.name,
                        )}.${escapeIdentifier(otherCol)}`,
                      );
                    }
                  }
                  // Then, all the conditions:
                  for (const { sql } of this.conditions) {
                    joinConditions.push(sql);
                  }
                  parent.leftJoinAndMapOne(
                    this.entity,
                    name,
                    parent.entity.name,
                    alias,
                    joinConditions.length > 0
                      ? `(${joinConditions.join(" AND ")})`
                      : "true",
                  );
                  for (const [alias, spec] of allowedJoins) {
                    parent.leftJoinAndMapOne(
                      spec.entity,
                      spec.relationName,
                      spec.parentAlias,
                      alias,
                      spec.condition,
                    );
                  }
                  for (const [paramName, depId] of Object.entries(
                    this.params,
                  )) {
                    parent.param(this.getDep(depId), paramName);
                  }
                  // tell that TypeormFind to fetch us
                  // and replace ourself with a single-item list of an access to this
                  return list([access(recordDep, relation.propertyName)]);
                } else {
                  console.warn(
                    `Could not inline because alias '${alias}' is already in use in ${parent}`,
                  );
                }
              } else if (relation) {
                console.warn(
                  `Could not inline ${this} into ${parent} via ${
                    relation.propertyName
                  } because we have some local joins: ${inspect(
                    disallowedJoins,
                  )}`,
                );
              }
            }
          }
        }
      }
    }

    // otherwise:
    return this;
  }

  requestedAttributes = new Set<string>();
  select(columnNames: string[]) {
    columnNames.forEach((n) => this.requestedAttributes.add(n));
  }
}

export function typeormFind<TEntity extends typeof BaseEntity>(
  entity: TEntity,
  spec: Partial<Record<keyof InstanceType<TEntity>, ExecutableStep<any>>>,
  isGuaranteedToExist = false,
) {
  return new TypeormFindStep(entity, spec, isGuaranteedToExist);
}

function rowToEntity(
  entityType: typeof BaseEntity,
  row: object,
  prefix: string,
  aliases: Record<string, AliasSpec>,
  currentAlias = entityType.name,
  depth = 0,
) {
  const obj = Object.create(null);
  for (const [key, val] of Object.entries(row)) {
    if (key.startsWith(prefix)) {
      obj[key.substring(prefix.length)] = val;
    }
  }
  if (Object.keys(obj).length === 0) {
    return null;
  }
  for (const [alias, spec] of Object.entries(aliases)) {
    switch (spec.type) {
      case "from":
      case "identifiers":
      case "innerJoin": {
        break;
      }
      case "leftJoinAndMapOne": {
        const { relationName, entity, parentAlias } = spec;
        if (parentAlias === currentAlias) {
          obj[relationName] = rowToEntity(
            entity,
            row,
            alias + "_",
            aliases,
            alias,
            depth + 1,
          );
        }
        break;
      }
      default: {
        const never: never = spec;
        throw new Error(`Unknown alias type '${never}'`);
      }
    }
  }
  return entityType.create(obj);
}
