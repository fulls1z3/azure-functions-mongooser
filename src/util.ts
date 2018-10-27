// libs
import { Promise as bluebird } from 'bluebird';
import { transform } from 'lodash/fp';
import * as mongoose from 'mongoose';
import { ErrorType, HttpStatusCode } from 'azure-functions-ts-essentials';

global.Promise = bluebird;

/**
 * Establishes mongoose connection.
 */
export function connect(instance: mongoose.Mongoose, connStr: string, timeout = 250, retry = 0): Promise<any> {
  return new Promise((resolve, reject) =>
    instance.connect(connStr, {promiseLibrary: bluebird, useMongoClient: true}, (err: any) => err
      ? retry < 100
        ? setTimeout(() => resolve(connect(instance, connStr)), timeout)
        : reject(err)
      : resolve()));
}

/**
 * Parses comma separated string field names into mongodb projection object.
 */
export function parseFields(rawFields: string | any): any {
  if (!rawFields)
    return {};

  return rawFields
    .split(',')
    .map((cur: string) => String(cur)
      .trim())
    .reduce((acc: Array<string>, cur: string) => {
      acc[cur] = 1;

      return acc;
    }, {});
}

const parseQueryValue = (queryValue: string) => {
  queryValue = decodeURIComponent(queryValue)
    .trim();

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
export function parseQuery(rawQuery: string | any): any {
  const res = {};

  if (!rawQuery)
    return res;

  rawQuery
    .split(',')
    .forEach((segment: string) => {
      if (!segment)
        return {};

      const parts = segment.match(/([^,]+):([^,]+|)?/);

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
  const lastObj = keys
    .reduce((acc, cur) => acc[cur] = acc[cur] || {}, obj);

  lastObj[lastKey] = 'path';

  return obj;
};

const toPopulation = (obj: any) => (transform as any)
  .convert({cap: false})((res: Array<any>, value: Array<any>, key: string) => [
    ...res,
    {
      path: key,
      ...(typeof(value) === 'object'
        ? {populate: toPopulation(value)}
        : {})
    }
  ], [], obj);

/**
 * Parses comma separated string populate names into mongodb population object.
 */
export function parsePopulation(rawPopulation: string | any): any {
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
export function parseSort(rawSort: string | any): any {
  return rawSort.replace(/,/g, ' ');
}

export const getErrorResponse = (err: any) => {
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
  return instance.connection.collections[name]
    .drop()
    .catch(() => clearCollection(instance, name));
}
