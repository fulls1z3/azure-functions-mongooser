// libs
import * as mongoose from 'mongoose';
import { HttpRequest, HttpStatusCode } from 'azure-functions-ts-essentials';

// models
import { BaseDocument } from './models/base-document';
import { ErrorType } from './models/error-type';

export { Activatable } from './models/activatable';
export { BaseDocument, ErrorType };

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

const getErrorResponse = (err: any) => {
  let status: HttpStatusCode | number = HttpStatusCode.InternalServerError;
  let type: ErrorType | string = '';

  if (err.name === 'MongoError' && err.code === 11000) {
    status = HttpStatusCode.Conflict;
    type = ErrorType.AlreadyExists;
  } else if (err.name === 'ValidationError') {
    status = HttpStatusCode.UnprocessableEntity;
    type = ErrorType.MissingField;
  }

  return {
    status,
    body: {
      type,
      message: err.message
    }
  };
};

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

/**
 * The mongoose-based RESTful API implementation.
 */
export class Mongooser<T extends BaseDocument> {
  constructor(private readonly model: any,
              private readonly objectName: string) {
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
            status: HttpStatusCode.NotFound
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
      .catch(getErrorResponse);
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
            hasMore: false,
            totalCount: data.length
          }
        };
      })
      .catch(getErrorResponse);
  };

  /**
   * Inserts a new item.
   *
   * @param {HttpRequest} req
   * @returns {Promise<any>}
   */
  insertOne = (req: HttpRequest): Promise<any> => {
    const contentType = req.headers ? req.headers['content-type'] : undefined;

    if (!(contentType && contentType.indexOf('application/json') >= 0))
      return Promise.resolve({
        status: HttpStatusCode.BadRequest,
        body: {
          type: ErrorType.Invalid
        }
      });

    if (!(req.body && Object.keys(req.body).length))
      return Promise.resolve({
        status: HttpStatusCode.BadRequest,
        body: {
          type: ErrorType.Invalid
        }
      });

    return this.model.insertMany(req.body)
      .then((docs: any) => {
        const data: T = docs[0].toObject();
        data._id = String(docs[0]._id);

        return {
          status: HttpStatusCode.Created,
          body: {
            _id: data._id,
            object: this.objectName,
            ...(data as any)
          }
        };
      })
      .catch(getErrorResponse);
  };

  /**
   * Updates (patches) an existing item.
   *
   * @param {HttpRequest} req
   * @param id
   * @returns {Promise<any>}
   */
  updateOne = (req: HttpRequest, id: any): Promise<any> => {
    const contentType = req.headers ? req.headers['content-type'] : undefined;

    if (!(contentType && contentType.indexOf('application/json') >= 0))
      return Promise.resolve({
        status: HttpStatusCode.BadRequest,
        body: {
          type: ErrorType.Invalid
        }
      });

    if (!(req.body && Object.keys(req.body).length))
      return Promise.resolve({
        status: HttpStatusCode.BadRequest,
        body: {
          type: ErrorType.Invalid
        }
      });

    if (!id)
      return Promise.resolve({
        status: HttpStatusCode.BadRequest,
        body: {
          type: ErrorType.Invalid
        }
      });

    return this.model.findOneAndUpdate({ _id: id }, req.body, { new: true }).lean()
      .then((doc: T) => {
        if (!doc)
          return {
            status: HttpStatusCode.BadRequest,
            body: {
              type: ErrorType.Missing
            }
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
      .catch(getErrorResponse);
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
        body: {
          type: ErrorType.Missing
        }
      });

    return this.model.findOneAndUpdate({ _id: id }, { isActive: false }).lean()
      .then((doc: T) => {
        if (!doc)
          return {
            status: HttpStatusCode.BadRequest
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
      .catch(getErrorResponse);
  };
}
