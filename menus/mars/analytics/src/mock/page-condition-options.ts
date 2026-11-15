import { defineMockEndpoint } from '@ap/mock-server';
import { catalogConditionOptionsEndpoint, productivityConditionOptionsEndpoint, pageConditionSampleOptionData } from '../endpoints';

export const pageConditionOptionsMock = [productivityConditionOptionsEndpoint, catalogConditionOptionsEndpoint].map(spec => defineMockEndpoint(spec, {
  mart: false,
  handle: () => pageConditionSampleOptionData,
  isEmpty: () => false,
}));
