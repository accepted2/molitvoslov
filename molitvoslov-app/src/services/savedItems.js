import {
  api,
} from '../api';


export const getSavedItems =
  async (params = {}) => {
    const response =
      await api.get(
        'saved-items/',
        {
          params,
        }
      );

    return response.data;
  };


export const saveItem =
  async payload => {
    const response =
      await api.post(
        'saved-items/',
        payload
      );

    return response.data;
  };


export const deleteSavedItem =
  async itemId => {
    await api.delete(
      `saved-items/${itemId}/`
    );
  };
