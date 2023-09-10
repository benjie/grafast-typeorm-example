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
    return new TypeormFindStep(
      this.entity,
      this.specColumns.reduce((memo, [columnName, depId]) => {
        memo[columnName] = this.getDep(depId);
        return memo;
      }, Object.create(null)),
    );
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
    if (this.specColumns.length === 0) {
      /* no filtering required */
    } else if (this.specColumns.length === 1) {
      const [columnName, depId] = this.specColumns[0];
      const ids = values[depId].filter((id) => id != null);
      qb.where({ [columnName]: In(ids) });
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
      outerloop: for (let i = 0; i < count; i++) {
        const tuple = [];
        for (const [columnName, depId] of this.specColumns) {
          const val = values[depId][i];
          if (val == null) continue outerloop;
          tuple.push(val);
        }
        tuples.push(tuple);
      }

      qb.addCommonTableExpression(
        `SELECT ${columnTypes
          .map((t, i) => `(j->>${i})::${escapeIdentifier(t)} AS ident_${i}`)
          .join(", ")} FROM json_array_elements(:json) j`,
        "grafast_idents",
      );
      qb.setParameters({
        json: JSON.stringify(tuples),
      });
      qb.innerJoin(
        "grafast_idents",
        "grafast_idents",
        `${propertyNames
          .map((n, i) => `${escapeIdentifier(n)} = ident_${i}`)
          .join(" AND ")}`,
      );
    }
    const records = (await qb.getMany()) as InstanceType<TEntity>[];

    if (this.specColumns.length === 0) {
      // No spec; therefore every call is the same
      return Array.from({ length: count }, () => records);
    }

    // Group the rows by their matching spec
    const rowsBySpec: Record<string, InstanceType<TEntity>[]> =
      Object.create(null);
    for (const record of records) {
      const spec = Object.create(null);
      for (const [columnName] of this.specColumns) {
        spec[columnName] = record[columnName];
      }
      const id = JSON.stringify(spec);
      if (!rowsBySpec[id]) {
        rowsBySpec[id] = [record] as InstanceType<TEntity>[];
      } else {
        rowsBySpec[id].push(record as InstanceType<TEntity>);
      }
    }

    // Now populate the results list
    const results = new Array<InstanceType<TEntity>[]>(count);
    for (let i = 0; i < count; i++) {
      const spec = Object.create(null);
      for (const [columnName, depId] of this.specColumns) {
        spec[columnName] = values[depId][i];
      }
      const id = JSON.stringify(spec);
      results[i] = rowsBySpec[id] ?? [];
    }
    return results;
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
}

export function typeormFind<TEntity extends typeof BaseEntity>(
  entity: TEntity,
  spec: Partial<Record<keyof InstanceType<TEntity>, ExecutableStep<any>>>,
) {
  return new TypeormFindStep(entity, spec);
}
