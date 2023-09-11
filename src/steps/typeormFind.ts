import {
  ConnectionCapableStep,
  ConnectionStep,
  ExecutableStep,
  GrafastResultsList,
  GrafastValuesList,
  InputStep,
  __ItemStep,
  constant,
  first,
  PageInfoCapableStep,
  ConstantStep,
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

export class TypeormFindStep<TEntity extends typeof BaseEntity>
  extends ExecutableStep<InstanceType<TEntity>[]>
  implements ConnectionCapableStep<TypeormRecordStep<TEntity>, ExecutableStep>
{
  specColumns: Array<[columnName: keyof InstanceType<TEntity>, depId: number]> =
    [];
  aliases: Record<
    string,
    | { type: "inner"; relationName: string }
    | { type: "from" }
    | { type: "identifiers" }
  > = Object.assign(Object.create(null), {
    tbl: { type: "from" },
    [GRAFAST_IDENTS]: { type: "identifiers" },
  });
  conditions: Array<{ sql: string }> = [];
  params: Record<string, number> = Object.create(null);
  constructor(
    public readonly entity: TEntity,
    spec: Partial<Record<keyof InstanceType<TEntity>, ExecutableStep<any>>>,
  ) {
    super();
    for (const [columnName, $column] of Object.entries(spec)) {
      this.specColumns.push([
        columnName as keyof InstanceType<TEntity>,
        this.addDependency($column),
      ]);
    }
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
        case "inner": {
          $clone.innerJoin(spec.relationName, alias);
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
    const params = Object.create(null);
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
        case "inner": {
          qb.innerJoin(spec.relationName, alias);
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
        this.entity.create(getEntityProperties(row, `${this.entity.name}_`)),
      ) as InstanceType<TEntity>[];
      return Array.from({ length: count }, () => records);
    } else {
      // Group the rows by their matching spec
      const recordsByIdx: Record<number, InstanceType<TEntity>[]> =
        Object.create(null);
      for (const row of rows) {
        const idx = row.grafast_idx;
        if (!recordsByIdx[idx]) recordsByIdx[idx] = [];
        const record = this.entity.create(
          getEntityProperties(row, `${this.entity.name}_`),
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
    return new TypeormRecordStep(this.entity, $item);
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
    return new TypeormRecordStep(this.entity, first(this));
  }

  innerJoin(relationName: string, alias: string) {
    if (this.aliases[alias]) {
      throw new Error("A table with that alias already exists");
    }
    this.aliases[alias] = { type: "inner", relationName };
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
}

export function typeormFind<TEntity extends typeof BaseEntity>(
  entity: TEntity,
  spec: Partial<Record<keyof InstanceType<TEntity>, ExecutableStep<any>>>,
) {
  return new TypeormFindStep(entity, spec);
}

function getEntityProperties(row: object, prefix: string) {
  const obj = Object.create(null);
  for (const [key, val] of Object.entries(row)) {
    if (key.startsWith(prefix)) {
      obj[key.substr(prefix.length)] = val;
    }
  }
  return obj;
}
