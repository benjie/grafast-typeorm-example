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

export class TypeormFindStep<
    TEntity extends typeof BaseEntity,
    TColumn extends keyof InstanceType<TEntity>,
  >
  extends ExecutableStep<InstanceType<TEntity>[]>
  implements ConnectionCapableStep<TypeormRecordStep<TEntity>, ExecutableStep>
{
  constructor(
    public readonly entity: TEntity,
    public readonly column: TColumn,
    $id: ExecutableStep<number | null>,
  ) {
    super();
    this.addDependency($id);
  }

  clone() {
    return new TypeormFindStep(this.entity, this.column, this.getDep(0));
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
    _count: number,
    [rawIds]: [GrafastValuesList<number | null>],
  ): Promise<GrafastResultsList<InstanceType<TEntity>[]>> {
    const ids = rawIds.filter((id) => id != null);
    const results = await this.entity.find({
      where: { [this.column]: In(ids) },
    });
    const rowsById: Record<number, InstanceType<TEntity>[]> =
      Object.create(null);
    for (const result of results) {
      const id = (result as any)[this.column];
      if (!rowsById[id]) {
        rowsById[id] = [result] as InstanceType<TEntity>[];
      } else {
        rowsById[id].push(result as InstanceType<TEntity>);
      }
    }
    return rawIds.map((id) => (id != null ? rowsById[id] ?? [] : []));
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

export function typeormFind<
  TEntity extends typeof BaseEntity,
  TColumn extends keyof InstanceType<TEntity>,
>(entity: TEntity, column: TColumn, $id: ExecutableStep<number | null>) {
  return new TypeormFindStep(entity, column, $id);
}
