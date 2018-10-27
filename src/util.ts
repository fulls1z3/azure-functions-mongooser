// libs
import { Promise as bluebird } from 'bluebird';
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

const parseQueryValue = (queryValue: string) => {
  queryValue = decodeURIComponent(queryValue)
    .trim();

  if (queryValue.toLowerCase() === 'null')
  // tslint:disable-next-line
    return null;
  else if (queryValue.toLowerCase() === 'undefined')
    return undefined;
  else if (queryValue.toLowerCase() === 'true')
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
// TODO: immutable
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

/**
 * Parses comma separated string field names into mongodb projection object.
 */
export function parseFields(rawFields: string | any): any {
  return String(rawFields).split(',')
    .map((cur: string) => String(cur)
      .trim())
    .reduce((acc: any, cur: string) => ({
      ...acc,
      [cur]: 1
    }), {});
}

// TODO: immutable
const appendObject = (obj: any, path: string) => {
  const keys: Array<any> = path.split(':');
  const lastKey = keys.pop();
  const lastObj = keys
    .reduce((acc, cur) => acc[cur] = acc[cur] || {}, obj);

  lastObj[lastKey] = 'path';

  return obj;
};

const toPopulation = obj => Object.keys(obj)
  .map(key => ({
    path: key,
    ...(typeof(obj[key]) === 'object'
      ? {populate: toPopulation(obj[key])}
      : undefined)
  }));

/**
 * Parses comma separated string populate names into mongodb population object.
 */
// TODO: immutable
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
  return String(rawSort)
    .replace(/,/g, ' ');
}

// TODO: immutable
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
