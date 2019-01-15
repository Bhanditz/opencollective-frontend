import uuidv4 from 'uuid/v4';

export const randomEmail = (base = 'oc-test') => {
  return `${base}-${uuidv4().split('-')[0]}@opencollective.com`;
};
