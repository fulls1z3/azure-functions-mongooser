// libs
import { Promise as bluebird } from 'bluebird';
import * as mongoose from 'mongoose';
import { ErrorType, HttpRequest, HttpResponse, HttpStatusCode } from 'azure-functions-ts-essentials';

// module
import { BaseDocument, UniqueId } from './models/base-document';
import { getErrorResponse } from './util';

global.Promise = bluebird;

type Population = mongoose.ModelPopulateOptions | Array<mongoose.ModelPopulateOptions>;

/**
 * Retrieves an existing item by id.
 */
export function getOne<T extends BaseDocument>(id: UniqueId,
                                               projection?: any,
                                               population?: Population): (model: any) => Promise<HttpResponse> {
  return model => {
    const query$ = model
      .findOne({_id: id}, projection)
      .populate(population)
      .lean();

    return query$
      .then(doc => !doc
        ? {status: HttpStatusCode.NotFound}
        : {
          status: HttpStatusCode.OK,
          body: {
            ...JSON.parse(JSON.stringify(doc)),
            _id: String(doc._id)
          }
        })
      .catch(getErrorResponse);
  };
}

/**
 * Retrieves existing items.
 */
export function getMany<T extends BaseDocument>(criteria?: any,
                                                projection?: any,
                                                population?: Population,
                                                page?: number | any,
                                                perPage?: number | any,
                                                sort?: string | any,
                                                showInactive?: boolean | any): (model: any) => Promise<any> {
  return model => {
    if (!criteria.hasOwnProperty('isActive') && !showInactive)
      criteria = {
        ...criteria,
        isActive: true
      };

    const count$ = model
      .find(criteria, projection)
      .count();

    const query$ = model
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

    return Promise
      .all([count$, query$])
      .then(([count, docs]) => ({
        status: HttpStatusCode.OK,
        body: {
          data: docs
            .reduce((acc, cur) => [
              ...acc,
              {
                ...JSON.parse(JSON.stringify(cur)),
                _id: String(cur._id)
              }
            ], []),
          hasMore: Number(page) >= 0 && Number(perPage) > 0
            ? count > (Number(page) + 1) * Number(perPage)
            : false,
          count
        }
      }))
      .catch(getErrorResponse);
  };
}

// TODO: add search

/**
 * Inserts new items.
 */
export function insertMany<T extends BaseDocument>(req: HttpRequest): (model: any) => Promise<HttpResponse> {
  return model => {
    const contentType = req.headers
      ? req.headers['content-type']
      : undefined;

    if (!(contentType && contentType.indexOf('application/json') >= 0))
      return Promise.resolve({
        status: HttpStatusCode.BadRequest,
        body: {type: ErrorType.Invalid}
      });

    if (!(req.body && Object.keys(req.body).length))
      return Promise.resolve({
        status: HttpStatusCode.BadRequest,
        body: {type: ErrorType.Invalid}
      });

    const query$ = model
      .insertMany(req.body);

    return query$
      .then(docs => {
        const data = docs
          .reduce((acc, cur) => [
            ...acc,
            {
              ...JSON.parse(JSON.stringify(cur)),
              _id: String(cur._id)
            }
          ], []);

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
  };
}

/**
 * Updates (patches) an existing item.
 */
export function updateOne<T extends BaseDocument>(req: HttpRequest, id: UniqueId): (model: any) => Promise<HttpResponse> {
  return model => {
    const contentType = req.headers
      ? req.headers['content-type']
      : undefined;

    if (!(contentType && contentType.indexOf('application/json') >= 0))
      return Promise.resolve({
        status: HttpStatusCode.BadRequest,
        body: {type: ErrorType.Invalid}
      });

    if (!(req.body && Object.keys(req.body).length))
      return Promise.resolve({
        status: HttpStatusCode.BadRequest,
        body: {type: ErrorType.Invalid}
      });

    if (!id)
      return Promise.resolve({
        status: HttpStatusCode.BadRequest,
        body: {type: ErrorType.Invalid}
      });

    const query$ = model
      .findOneAndUpdate({_id: id}, req.body, {new: true})
      .lean();

    return query$
      .then(doc => !doc
        ? {
          status: HttpStatusCode.BadRequest,
          body: {type: ErrorType.Missing}
        }
        : {
          status: HttpStatusCode.OK,
          body: {
            ...JSON.parse(JSON.stringify(doc)),
            _id: String(doc._id)
          }
        })
      .catch(getErrorResponse);
  };
}

/**
 * Deactivates an existing item.
 */
export function deactivateOne<T extends BaseDocument>(id: UniqueId): (model: any) => Promise<HttpResponse> {
  return model => {
    if (!id)
      return Promise.resolve({
        status: HttpStatusCode.BadRequest,
        body: {
          type: ErrorType.Missing
        }
      });

    const query$ = model
      .findOneAndUpdate({_id: id}, {isActive: false})
      .lean();

    return query$
      .then(doc => !doc
        ? {status: HttpStatusCode.BadRequest}
        : {
          status: HttpStatusCode.OK,
          body: {
            deactivated: true,
            _id: String(doc._id)
          }
        })
      .catch(getErrorResponse);
  };
}

// TODO: add deleteOne
