// libs
import * as mongoose from 'mongoose';
import { HttpRequest, HttpStatusCode } from 'azure-functions-ts-essentials';

// models
import { BaseDocument } from './models/base-document';

export { Activatable } from './models/activatable';
export { BaseDocument };

/**
 * Establishes mongoose connection.
 *
 * @param {mongoose.Mongoose} instance
 * @param {string} connStr
 */
export function connect(instance: mongoose.Mongoose, connStr: string): Promise<any> {
  return new Promise((resolve, reject) =>
    instance.connect(connStr, { useMongoClient: true }, (err: any) => err
      ? reject(err)
      : resolve()));
}

/**
 * Parses comma separated string field names into mongodb projection object.
 *
 * @param {string} rawFields
 * @returns {{}}
 */
export function parseFields(rawFields: string): any {
  if (!rawFields)
    return {};

  return rawFields.split(',')
    .map(cur => String(cur).trim())
    .reduce((acc, cur) => {
      acc[cur] = 1;

      return acc;
    }, {});
}

/**
 * Clears an existing collection using recursive retries.
 *
 * @param {"mongoose".Mongoose} instance
 * @param {string} name
 * @returns {Promise<any>}
 */
export function clearCollection(instance: mongoose.Mongoose, name: string): Promise<any> {
  const collection = instance.connection.collections[name];

  return collection.drop()
    .catch(() => clearCollection(instance, name));
}

export class Mongooser<T extends BaseDocument> {
  constructor(private readonly model: any,
              private readonly objectName: string,
              private readonly url: string) {
  }

  /**
   * Retrieves an existing item by id.
   *
   * @param id
   * @returns {Promise<any>}
   */
  getOne = (id: any): Promise<any> => {
    const query = this.model.findOne({ _id: id }).lean();

    return query.
    then((doc: T) => {
      if (!doc)
        return Promise.resolve({
          status: HttpStatusCode.NotFound,
          body: {}
        });

      const data: T = doc;
      data._id = String(doc._id);

      return {
        status: HttpStatusCode.OK,
        body: {
          _id: data._id,
          object: this.objectName,
          ...(data as any)
        }
      };
    })
    .catch((err: any) => ({
      status: HttpStatusCode.InternalServerError,
      body: {}
    }));
  };

  /**
   * Retrieves existing items.
   *
   * @param {HttpRequest} req
   * @param projection
   * @param {boolean} showInactive
   * @returns {Promise<any>}
   */
  getMany = (req: HttpRequest, projection: any, showInactive: boolean): Promise<any> => {
    const query = showInactive
      ? this.model.find({}, projection).lean()
      : this.model.find({ isActive: true }, projection).lean();

    return query
      .then((docs: any) => {
        const data: Array<T> = [];

        for (const item of docs as Array<T>) {
          item._id = String(item._id);
          data.push({
            _id: item._id,
            object: this.objectName,
            ...(item as any)
          });
        }

        return {
          status: HttpStatusCode.OK,
          body: {
            object: 'list',
            data,
            url: this.url,
            hasMore: false,
            totalCount: data.length
          }
        };
      })
      .catch((err: any) => ({
        status: HttpStatusCode.InternalServerError,
        body: {}
      }));
  };

  /**
   * Inserts a new item.
   *
   * @param {HttpRequest} req
   * @returns {Promise<any>}
   */
  insertOne = (req: HttpRequest): Promise<any> => {
    const item = JSON.parse(req.body || '{}');

    if (!Object.keys(item).length)
      return Promise.resolve({
        status: HttpStatusCode.BadRequest,
        body: {}
      });

    return this.model.insertMany(item)
      .then((docs: any) => {
        const data: T = docs[0].toObject();
        data._id = String(docs[0]._id);

        return {
          status: HttpStatusCode.OK,
          body: {
            _id: data._id,
            object: this.objectName,
            ...(data as any)
          }
        };
      })
      .catch((err: any) => ({
        status: HttpStatusCode.InternalServerError,
        body: {}
      }));
  };

  /**
   * Updates (patches) an existing item.
   *
   * @param {HttpRequest} req
   * @param id
   * @returns {Promise<any>}
   */
  updateOne = (req: HttpRequest, id: any): Promise<any> => {
    const item = JSON.parse(req.body || '{}');

    if (!Object.keys(item).length)
      return Promise.resolve({
        status: HttpStatusCode.BadRequest,
        body: {}
      });

    if (!id)
      return Promise.resolve({
        status: HttpStatusCode.BadRequest,
        body: {}
      });

    return this.model.findOneAndUpdate({ _id: id }, item, { new: true }).lean()
      .then((doc: T) => {
        if (!doc)
          return {
            status: HttpStatusCode.BadRequest,
            body: {}
          };
        else {
          const data: T = doc;
          data._id = String(doc._id);

          return {
            status: HttpStatusCode.OK,
            body: {
              _id: data._id,
              object: this.objectName,
              ...(data as any)
            }
          };
        }
      })
      .catch((err: any) => ({
        status: HttpStatusCode.InternalServerError,
        body: {}
      }));
  };

  /**
   * Deactivates an existing item.
   *
   * @param id
   * @returns {Promise<any>}
   */
  deactivateOne = (id: any): Promise<any> => {
    if (!id)
      return Promise.resolve({
        status: HttpStatusCode.BadRequest,
        body: {}
      });

    return this.model.findOneAndUpdate({ _id: id }, { isActive: false }).lean()
      .then((doc: T) => {
        if (!doc)
          return {
            status: HttpStatusCode.BadRequest,
            body: {}
          };
        else
          return {
            status: HttpStatusCode.OK,
            body: {
              deactivated: true,
              _id: String(doc._id)
            }
          };
      })
      .catch((err: any) => ({
        status: HttpStatusCode.InternalServerError,
        body: {}
      }));
  };
}
