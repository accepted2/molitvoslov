import React, {useEffect, useState,useRef} from "react";
import {View, Text,ScrollView,StyleSheet,ActivityIndicator} from "react-native";
import {api} from '../api'
import {
  useReadingProgress
} from '../hooks/useReadingProgress';

export const PrayerRuleScreen = ({route}) => {
  const {slug} = route.params

  const [rule, setRule] = useState(null)
  const {
    savedProgress,
    scheduleSave,
  }=useReadingProgress({
    sourceType:'prayer_rule',
    sourceId:rule?.id,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    restoredRef.current=false
    savedAnchorIdRef.current=null
    currentItemRef.current = null
    itemPositionsRef.current={}
    loadRule()

  }, [slug]);

  const scrollRef = useRef(null)
  const itemPositionsRef = useRef({})
  const savedAnchorIdRef = useRef(null)
  const restoredRef = useRef(false)
  const currentItemRef = useRef(null)

  const [highlightedItemId, setHighlightedItemId] = useState(null)

  useEffect(()=>{
    if (
      savedProgress?.anchor_type === 'prayer_rule_item'
    ) {
      savedAnchorIdRef.current= savedProgress.anchor_id
      tryRestorePosition()
    }
  },[savedProgress])

  const loadRule = async () => {
    try {
      setLoading(true)
      const response = await api.get(
        `prayer-rules/${slug}/`
      )
      const ruleData = response.data
      setRule(ruleData)

    } catch (error) {
      console.error('Ошибка загрузки молитвенного правила:'),
        error
    } finally {
      setLoading(false)
    }
  }

  const handleItemLayout = (itemId, event) => {
    const y = event.nativeEvent.layout.y
    itemPositionsRef.current[itemId] = y
    tryRestorePosition()
  }

  const tryRestorePosition = () => {
    if (restoredRef.current) {
      return
    }
    const anchorId = savedAnchorIdRef.current

    if (!anchorId) {
      return
    }
    const y = itemPositionsRef.current[anchorId]
    if (y === undefined) {
      return
    }
    if (!scrollRef.current) {
      return
    }
    restoredRef.current = true

    setTimeout(() => {
      scrollRef.current?.scrollTo({
        y: Math.max(y - 30, 0),
        animated: false,
      })

      setHighlightedItemId(anchorId)

      setTimeout(() => {
        setHighlightedItemId(null)
      }, 2500)
    }, 200)
  }

  const getCurrentItem = (scrollY) => {
    const positions = Object.entries(itemPositionsRef.current)
      .map(([id, y]) => ({
        id: Number(id),
        y
      }))
      .sort((a, b) => a.y - b.y)

    if (!positions.length) {
      return null
    }
    const readingLine = scrollY + 70

    let current = positions[0]

    for (const position of positions) {
      if (position.y <= readingLine) {
        current = position
      } else {
        break
      }
    }
    return current
  }
  const handleScroll = (event) => {
    if (!rule) {
      return
    }

  const scrollY = event.nativeEvent.contentOffset.y
  const current = getCurrentItem(scrollY)

  if (!current) {
    return
  }
  if (currentItemRef.current === current.id) {
    return
  }
  currentItemRef.current = current.id

  scheduleSave({
    anchorType:'prayer_rule_item',
    anchorId: current.id,
    offset:0,
  })
}

  if(loading){
    return (
      <View style={styles.center}>
        <ActivityIndicator
        size="large"
        color="#2c3e50"
        />

        <Text style={styles.loadingText}>
          Загрузка...
        </Text>
      </View>
    )
  }

  if(!rule){
    return (
      <View style={styles.center}>
        <Text>
          Молитвенное правило не найдено
        </Text>
      </View>
    )
  }
  const renderFootnotes = (item) =>{
    if(!item.footnotes?.length){
      return null
    }

  return (
    <View style={styles.footnotesContainer}>
      {item.footnotes.map((footnote)=>(
        <Text
        key={footnote.id}
        style={styles.footnote}
        >
          [{footnote.number}] {footnote.content}
        </Text>
      ))}
    </View>
  )
  }

  const renderTextItem =(item)=>{
    const text = item.text

    if(!text){
      return null
    }
    return (
    <View style={styles.prayerBlock}>
      {!!text.title &&(
        <Text style={styles.title}>
          {text.title}
        </Text>
      )}

      {text.description_position === 'before' &&
      !!text.description && (
        <Text style={styles.description}>
          {text.description}
        </Text>
        )}

      <Text style={styles.content}>
        {text.content}
      </Text>

      {text.description_position === 'after' &&
      !!text.description && (
        <Text style={styles.descriptionAfter}>
          {text.description}
        </Text>
        )}

      {!!item.note && (
        <Text style={styles.note}>
          {item.note}
        </Text>
      )}
      {renderFootnotes(item)}
    </View>
    )
  }

  const renderInstruction =(item) =>{
    return (
      <View style={styles.instructionBlock}>
        <Text style={styles.instruction}>
          {item.content}
        </Text>
        {renderFootnotes(item)}
      </View>
    )
  }

  const renderSection = (item) => {
    return (
      <View style={styles.sectionBlock}>
        {!!item.title && (
            <Text style={styles.sectionTitle}>
              {item.title}
            </Text>
          )}

        {!!item.content && (
          <Text style={styles.sectionContent}>
            {item.content}
          </Text>
        )}
        {renderFootnotes(item)}
      </View>
    )
  }

  const renderItem = (item)=>{
    switch (item.item_type){
      case 'text':
        return renderTextItem(item)
      case 'instruction':
        return renderInstruction(item)
      case 'section':
        return renderSection(item)
      default:
        return null
    }
  }

  return (
    <ScrollView
    ref={scrollRef}
    style={styles.container}
    contentContainerStyle={styles.contentContainer}
    onScroll={handleScroll}
    scrollEventThrottle={200}
    >
      <Text style={styles.headerTitle}>
        {rule.name}
      </Text>

      {!!rule.description && (
        <Text style={styles.ruleDescription}>
          {rule.description}
        </Text>
      )}

      {rule.items.map((item,index)=>(
        <View
          key={item.id}
          onLayout={(event)=> handleItemLayout(item.id,event)}
          style={[
            styles.itemWrapper,
            highlightedItemId === item.id && styles.itemHighlighted
          ]}
        >
        {renderItem(item)}
          {index < rule.items.length -1 && (
            <View style={styles.divider}/>
          )}
          </View>
      ))}

    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#faf8f5',
  },

  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 60,
  },

  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  loadingText: {
    marginTop: 10,
  },

  headerTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#2c3e50',
    textAlign: 'center',
    fontFamily: 'serif',
    marginBottom: 24,
  },

  ruleDescription: {
    fontSize: 14,
    lineHeight: 21,
    color: '#666',
    fontStyle: 'italic',
    fontFamily: 'serif',
    marginBottom: 24,
  },

  prayerBlock: {
    marginVertical: 8,
  },

  title: {
    fontSize: 19,
    fontWeight: 'bold',
    color: '#717171',
    textAlign: 'center',
    fontFamily: 'serif',
    marginBottom: 10,
  },

  content: {
    fontSize: 17,
    lineHeight: 29,
    color: '#333',
    fontFamily: 'serif',
  },

  description: {
    fontSize: 13,
    lineHeight: 20,
    color: '#ae1721',
    fontStyle: 'italic',
    fontFamily: 'serif',
    marginBottom: 8,
    paddingHorizontal: 4,
  },

  descriptionAfter: {
    fontSize: 13,
    lineHeight: 20,
    color: '#ae1721',
    fontStyle: 'italic',
    fontFamily: 'serif',
    marginTop: 8,
    paddingHorizontal: 4,
  },

  note: {
    fontSize: 13,
    lineHeight: 20,
    color: '#8b5e3c',
    fontStyle: 'italic',
    fontFamily: 'serif',
    marginTop: 8,
  },

  instructionBlock: {
    marginVertical: 8,
  },

  instruction: {
    fontSize: 14,
    lineHeight: 22,
    color: '#7b5b42',
    fontStyle: 'italic',
    fontFamily: 'serif',
  },

  sectionBlock: {
    marginVertical: 10,
  },

  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#555',
    textAlign: 'center',
    fontFamily: 'serif',
    marginBottom: 8,
  },

  sectionContent: {
    fontSize: 16,
    lineHeight: 26,
    color: '#444',
    fontFamily: 'serif',
  },

  footnotesContainer: {
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e5e0da',
  },

  footnote: {
    fontSize: 12,
    lineHeight: 18,
    color: '#777',
    fontFamily: 'serif',
    marginBottom: 4,
  },

  divider: {
    height: 1,
    backgroundColor: '#eee',
    marginVertical: 18,
  },
  itemWrapper:{
    borderRadius:8,
    paddingHorizontal: 4,
  },
  itemHighlighted: {
    backgroundColor:'rgba(255,220,100,0.35)'
  }
});