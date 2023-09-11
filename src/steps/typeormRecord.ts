import {
  ExecutableStep,
  GrafastResultsList,
  GrafastValuesList,
  __ItemStep,
  access,
  lambda,
} from "grafast";
import { BaseEntity } from "typeorm";

export class TypeormRecordStep<
  TEntity extends typeof BaseEntity,
> extends ExecutableStep<InstanceType<TEntity>> {
  isSyncAndSafe = true;
  constructor(
    public readonly entity: TEntity,
    $item: ExecutableStep<InstanceType<TEntity>>,
  ) {
    super();
    this.addDependency($item);
  }
  toStringMeta(): string {
    return this.entity.name;
  }

  execute(
    _count: number,
    values: [GrafastValuesList<any>],
  ): GrafastResultsList<InstanceType<TEntity>> {
    return values[0];
  }

  get<TKey extends keyof InstanceType<TEntity>>(
    key: TKey,
  ): ExecutableStep<InstanceType<TEntity>[TKey]> {
    // TODO: track this column was requested, add to select
    return access(this, key);
  }

  node() {
    return this;
  }

  cursor() {
    const pks = this.entity.getRepository().metadata.primaryColumns;
    if (pks.length !== 1) {
      throw new Error(`Currently only support tables with a single PK column`);
    }
    const pkColName = pks[0].propertyName as keyof InstanceType<TEntity>;
    const $id = this.get(pkColName);
    return lambda($id, (id) =>
      Buffer.from(JSON.stringify([pkColName, id]), "utf8").toString("base64"),
    );
  }
}
