import {
  ExecutableStep,
  FirstStep,
  GrafastResultsList,
  GrafastValuesList,
  __ItemStep,
  access,
  lambda,
} from "grafast";
import { BaseEntity } from "typeorm";
import { TypeormFindStep } from "./typeormFind";

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
    // If this key is one of the specs used to fetch itself, return the spec'd value instead
    // TODO: only do this if safe to do so, e.g. `citext` wouldn't be safe since
    // the records 'username' might be 'Benjie' but the search parameter might
    // be 'bEnJiE'.
    let parent = this.getDep(0);
    while (parent instanceof __ItemStep || parent instanceof FirstStep) {
      parent = parent.getDep(0);
    }
    if (parent instanceof TypeormFindStep) {
      const spec = parent.specColumns.find((spec) => spec[0] === key);
      if (spec) {
        const $dep = parent.getDep(spec[1]);
        console.log(
          `FOUND! Replacing ${this}.get('${String(key)}') with ${$dep}`,
        );
        return $dep;
      }
    }

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
