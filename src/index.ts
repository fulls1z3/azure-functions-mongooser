// libs
import * as _ from 'lodash';
import * as mongoose from 'mongoose';
import { ErrorType, HttpRequest, HttpStatusCode } from 'azure-functions-ts-essentials';

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
    instance.connect(connStr, {useMongoClient: true}, (err: any) => err
      ? connect(instance, connStr)
      : resolve()));
}

/**
 * Parses comma separated string field names into mongodb projection object.
 *
 * @param {string} rawFields
 * @returns {any}
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
 * Parses comma separated string populate names into mongodb population object.
 *
 * @param {string} rawPopulation
 * @returns {any}
 */
export function parsePopulation(rawPopulation: string): any {
  if (!rawPopulation)
    return '';

  let obj = {};

  for (const item of rawPopulation.split(','))
    obj = appendObject(obj, item);

  return toPopulation(obj);
}

const appendObject = (obj: any, path: string) => {
  const keys: Array<any> = path.split(':');
  const lastKey = keys.pop();
  const lastObj = keys.reduce((acc, cur) => acc[cur] = acc[cur] || {}, obj);

  lastObj[lastKey] = 'path';

  return obj;
};

const toPopulation = (obj: any) => {
  return _.transform(obj, (res: Array<any>, value: Array<any>, key: string) => {
    if (typeof(value) === 'object')
      res.push({
        path: key,
        populate: toPopulation(value)
      });
    else
      res.push({path: key});
  }, []);
};

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
  constructor(private readonly model: any) {
  }

  /**
   * Retrieves an existing item by id.
   *
   * @param id
   * @param projection
   * @param {"mongoose".ModelPopulateOptions | Array<"mongoose".ModelPopulateOptions>} population
   * @returns {Promise<any>}
   */
  getOne(id: any,
         projection?: any,
         population?: mongoose.ModelPopulateOptions | Array<mongoose.ModelPopulateOptions>): Promise<any> {
    const query = this.model.findOne({_id: id}, projection).populate(population).lean();

    return query.then((doc: T) => {
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
          ...JSON.parse(JSON.stringify(data))
        }
      };
    })
      .catch(getErrorResponse);
  }

  /**
   * Retrieves existing items.
   *
   * @param projection
   * @param {boolean} showInactive
   * @param {"mongoose".ModelPopulateOptions | Array<"mongoose".ModelPopulateOptions>} population
   * @returns {Promise<any>}
   */
  getMany(projection?: any,
          showInactive = false,
          population?: mongoose.ModelPopulateOptions | Array<mongoose.ModelPopulateOptions>): Promise<any> {
    const query = this.model.find(!showInactive
      ? {isActive: true}
      : {}, projection).populate(population).lean();

    return query
      .then((docs: any) => {
        const data: Array<T> = [];

        for (const item of docs as Array<T>) {
          item._id = String(item._id);
          data.push({
            _id: item._id,
            ...JSON.parse(JSON.stringify(item))
          });
        }

        return {
          status: HttpStatusCode.OK,
          body: {
            data,
            hasMore: false,
            totalCount: data.length
          }
        };
      })
      .catch(getErrorResponse);
  }

  /**
   * Inserts new items.
   *
   * @param {HttpRequest} req
   * @returns {Promise<any>}
   */
  insertMany(req: HttpRequest): Promise<any> {
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
        const data: Array<T> = [];

        for (const item of docs as Array<T>) {
          item._id = String(item._id);
          data.push({
            _id: item._id,
            ...JSON.parse(JSON.stringify(item))
          });
        }

        return {
          status: HttpStatusCode.Created,
          body: {
            data,
            hasMore: false,
            totalCount: data.length
          }
        };
      })
      .catch(getErrorResponse);
  }

  /**
   * Updates (patches) an existing item.
   *
   * @param {HttpRequest} req
   * @param id
   * @returns {Promise<any>}
   */
  updateOne(req: HttpRequest, id: any): Promise<any> {
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

    return this.model.findOneAndUpdate({_id: id}, req.body, {new: true}).lean()
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
              ...JSON.parse(JSON.stringify(data))
            }
          };
        }
      })
      .catch(getErrorResponse);
  }

  /**
   * Deactivates an existing item.
   *
   * @param id
   * @returns {Promise<any>}
   */
  deactivateOne(id: any): Promise<any> {
    if (!id)
      return Promise.resolve({
        status: HttpStatusCode.BadRequest,
        body: {
          type: ErrorType.Missing
        }
      });

    return this.model.findOneAndUpdate({_id: id}, {isActive: false}).lean()
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
  }
}
