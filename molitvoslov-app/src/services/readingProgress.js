import {api} from '../api'

export const getReadingProgress = async ()=>{
  const response = await api.get('reading-progress/')
  return response.data
}

export const saveReadingProgress = async ({
  sourceType,
  sourceId,
  anchorType,
  anchorId,
  offset=0,
}) => {
  const response = await api.post(
    'reading-progress/',
    {
      source_type: sourceType,
      source_id:sourceId,
      anchor_type:anchorType,
      anchor_id:anchorId,
      offset,
    }
  )
  return response.data
}