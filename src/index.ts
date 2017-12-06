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
 */
export function connect(instance: mongoose.Mongoose, connStr: string, timeout = 250, retry = 0): Promise<any> {
  return new Promise((resolve, reject) =>
    instance.connect(connStr, {useMongoClient: true}, (err: any) => err
      ? retry < 100
        ? setTimeout(() => resolve(connect(instance, connStr)), timeout)
        : reject(err)
      : resolve()));
}

/**
 * Parses comma separated string field names into mongodb projection object.
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

const parseQueryValue = (queryValue: string) => {
  queryValue = decodeURIComponent(queryValue).trim();

  if (queryValue.toLowerCase() === 'null')
    // tslint:disable-next-line
    return null;
  if (queryValue.toLowerCase() === 'undefined')
    return undefined;
  if (queryValue.toLowerCase() === 'true')
    return true;
  else if (queryValue.toLowerCase() === 'false')
    return false;
  else if (queryValue === '0')
    return 0;
  else if (Number(queryValue) !== 0 && !isNaN(Number(queryValue)))
    return Number(queryValue);
  else
    return {$regex: queryValue, $options: 'i'};
};

/**
 * Parses the query string into mongodb criteria object.
 */
export function parseQuery(rawQuery: string): any {
  const res = {};

  if (!rawQuery)
    return res;

  rawQuery.split(',').forEach(segment => {
    if (!segment)
      return {};

    const parts = segment.match(/([^,]+)::([^,]+|)?/);

    if (!(parts && parts.length > 0))
      return {};

    const path = parts[1].match(/([^.]+)/g);

    let current = res;

    (path as Array<string>).forEach((m, i) => {
      if (!current[m])
        current[m] = {};

      if (i === (path as Array<string>).length - 1)
        current[m] = (!parts[2])
          ? ''
          : parseQueryValue(parts[2]);
      else
        current = current[m];
    });
  });

  return res;
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

/**
 * Parses comma separated string populate names into mongodb population object.
 */
export function parsePopulation(rawPopulation: string): any {
  if (!rawPopulation)
    return '';

  let obj = {};

  for (const item of rawPopulation.split(','))
    obj = appendObject(obj, item);

  return toPopulation(obj);
}

/**
 * Parses comma separated string sort names into mongodb population object.
 */
export function parseSort(rawSort: string): any {
  return rawSort.replace(/,/g, ' ');
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
   */
  getOne(id: any,
         projection?: any,
         population?: mongoose.ModelPopulateOptions | Array<mongoose.ModelPopulateOptions>): Promise<any> {
    const query$ = this.model.findOne({_id: id}, projection).populate(population).lean();

    return query$
      .then((doc: T) => {
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
   */
  getMany(criteria?: any,
          projection?: any,
          population?: mongoose.ModelPopulateOptions | Array<mongoose.ModelPopulateOptions>,
          page?: number,
          perPage?: number,
          sort?: string,
          showInactive?: boolean): Promise<any> {
    if (!criteria.hasOwnProperty('isActive') && !showInactive)
        criteria = {...criteria, isActive: true};

    const count$ = this.model
      .find(criteria, projection)
      .count();

    const query$ = this.model
      .find(criteria, projection)
      .sort(sort)
      .skip(Number(page) >= 0 && Number(perPage) > 0
        ? Number(page) * Number(perPage)
        : 0)
      .limit(Number(page) >= 0 && Number(perPage) > 0
        ? Number(perPage)
        : 0)
      .populate(population)
      .lean();

    return Promise.all([count$, query$])
      .then((res: Array<any>) => {
        const totalCount = res[0];
        const docs = res[1];
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
            hasMore: Number(page) >= 0 && Number(perPage) > 0
              ? totalCount > (Number(page) + 1) * Number(perPage)
              : false,
            totalCount
          }
        };
      })
      .catch(getErrorResponse);
  }

  /**
   * Inserts new items.
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

    const query$ = this.model.insertMany(req.body);

    return query$.then((docs: any) => {
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

    const query$ = this.model.findOneAndUpdate({_id: id}, req.body, {new: true}).lean();

    return query$.then((doc: T) => {
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
   */
  deactivateOne(id: any): Promise<any> {
    if (!id)
      return Promise.resolve({
        status: HttpStatusCode.BadRequest,
        body: {
          type: ErrorType.Missing
        }
      });

    const query$ = this.model.findOneAndUpdate({_id: id}, {isActive: false}).lean();

    return query$.then((doc: T) => {
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
