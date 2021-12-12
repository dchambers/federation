import {
  fetch,
  Request,
  Response,
  Body,
  BodyInit,
  Headers,
  HeadersInit,
  URL,
  URLSearchParams,
} from 'apollo-server-env';

interface FetchMock extends jest.MockedFunction<typeof fetch> {
  mockResponseOnce(data?: any, headers?: HeadersInit, status?: number): this;
  mockJSONResponseOnce(data?: object, headers?: HeadersInit): this;
}

const mockFetch = jest.fn(fetch) as unknown as FetchMock;

mockFetch.mockResponseOnce = (
  data?: BodyInit,
  headers?: Headers,
  status: number = 200,
) => mockFetch.mockImplementationOnce(async () => new Response(data, {
      status,
      headers,
    }));

mockFetch.mockJSONResponseOnce = (
  data = {},
  headers?: Headers,
  status?: number,
) => mockFetch.mockResponseOnce(
    JSON.stringify(data),
    { 'Content-Type': 'application/json', ...headers },
    status,
  );

const env = {
  fetch: mockFetch,
  Request,
  Response,
  Body,
  Headers,
  URL,
  URLSearchParams,
};

jest.doMock('apollo-server-env', () => env);

export = env;
