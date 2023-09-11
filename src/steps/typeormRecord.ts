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
  public readonly entity: TEntity;
  private readonly findStepId: number;
  constructor(
    findStep: TypeormFindStep<TEntity>,
    $item: ExecutableStep<InstanceType<TEntity>>,
  ) {
    super();
    this.findStepId = findStep.id;
    this.entity = findStep.entity;
    this.addDependency($item);
  }
  toStringMeta(): string {
    return this.entity.name;
  }

  getFindStep(): TypeormFindStep<TEntity> {
    return this.getStep(this.findStepId) as any;
  }

  execute(
    _count: number,
    values: [GrafastValuesList<any>],
  ): GrafastResultsList<InstanceType<TEntity>> {
    return values[0];
  }

  requestedAttributes = new Set<string>();
  get<TKey extends keyof InstanceType<TEntity>>(
    key: TKey,
  ): ExecutableStep<InstanceType<TEntity>[TKey]> {
    // If this key is one of the specs used to fetch itself, return the spec'd value instead
    // TODO: only do this if safe to do so, e.g. `citext` wouldn't be safe since
    // the records 'username' might be 'Benjie' but the search parameter might
    // be 'bEnJiE'.
    const parent = this.getFindStep();
    const spec = parent.specColumns.find((spec) => spec[0] === key);
    if (spec) {
      const $dep = parent.getDep(spec[1]);
      return $dep;
    }

    this.requestedAttributes.add(key as string);

    return access(this, key);
  }

  optimize(): ExecutableStep<any> {
    this.getFindStep().select([...this.requestedAttributes]);
    // This step doesn't need to exist at runtime
    return this.getDep(0);
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
