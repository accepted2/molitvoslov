'use strict';
// Safe date rollover fix. Never overwrite local Menu/ChurchCalendar edits;
// check all patches first, back up originals, then update both files.
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const hookPath=path.join(root,'src/hooks/useCalendarTodayRollover.js');
if(!fs.existsSync(hookPath) ||
  !fs.readFileSync(hookPath,'utf8').includes('useCalendarTodayRollover')){
  throw Error('First restore src/hooks/useCalendarTodayRollover.js. No files changed.');
}
const patches=[{"path":"src/screens/MenuScreen.js","changes":[{"before":"import {getOfflineCalendarDay, getOfflineCalendarMonth} from '../services/calendarOfflineStore';","after":"import {getOfflineCalendarDay, getOfflineCalendarMonth} from '../services/calendarOfflineStore';\nimport {useCalendarTodayRollover, shouldAdvanceSelectedDay} from '../hooks/useCalendarTodayRollover';"},{"before":"  const selectedCalendarDateRef = useRef(calendarSelectedDate);\n  selectedCalendarDateRef.current = calendarSelectedDate;","after":"  const selectedCalendarDateRef = useRef(calendarSelectedDate);\n  selectedCalendarDateRef.current = calendarSelectedDate;\n\n  const calendarLocalToday = useCalendarTodayRollover((previousToday, currentToday) => {\n    // Do not override an explicitly selected day other than yesterday's\n    // \"today\". Avoid changing the visible month if the user browsed away.\n    if (!shouldAdvanceSelectedDay(\n      toCalendarDate(selectedCalendarDateRef.current), previousToday,\n    )) return;\n    const [year, month, day] = currentToday.split('-').map(Number);\n    const nextDate = new Date(year, month - 1, day);\n    selectedCalendarDateRef.current = nextDate;\n    setCalendarSelectedDate(nextDate);\n    setCalendarVisibleMonth(visible => {\n      if (toCalendarDate(visible).slice(0, 7) !== previousToday.slice(0, 7)) {\n        return visible;\n      }\n      return new Date(year, month - 1, 1);\n    });\n  });"},{"before":"    [calendarVisibleMonth, calendarSelectedDate, calendarLanguage]\n  );","after":"    [calendarVisibleMonth, calendarSelectedDate, calendarLanguage, calendarLocalToday]\n  );"},{"before":"  const updateCalendarWidget = useCallback(\n    async (day = calendarToday, language = calendarLanguage) => {\n      try {\n        await requestWidgetUpdate({\n          widgetName: 'ChurchCalendar',\n          renderWidget: (widgetInfo) => (\n            <ChurchCalendarWidget\n              day={day}\n              language={language}\n              width={widgetInfo.width}\n              height={widgetInfo.height}\n            />\n          ),\n        });\n      } catch (error) {\n        console.log('Ошибка обновления виджета календаря:', error?.message || error);\n      }\n    },\n    [calendarToday, calendarLanguage]\n  );\n\n","after":"  const updateCalendarWidget = useCallback(\n    async (day = null, language = calendarLanguage) => {\n      try {\n        // Calendar widget is ALWAYS a today widget. It must not inherit a\n        // historical date selected in the main screen's mini calendar.\n        const todayKey = toCalendarDate(new Date());\n        const widgetDay = day?.date_gregorian === todayKey\n          ? day\n          : await getOfflineCalendarDay(todayKey, getCalendarDataLanguage(language));\n        if (!widgetDay) return;\n        await requestWidgetUpdate({\n          widgetName: 'ChurchCalendar',\n          renderWidget: (widgetInfo) => (\n            <ChurchCalendarWidget\n              day={widgetDay}\n              language={language}\n              width={widgetInfo.width}\n              height={widgetInfo.height}\n            />\n          ),\n        });\n      } catch (error) {\n        console.log('Ошибка обновления виджета календаря:', error?.message || error);\n      }\n    },\n    [calendarLanguage]\n  );\n\n"},{"before":"  }, [calendarToday, calendarLanguage, updateCalendarWidget]);","after":"  }, [calendarToday, calendarLanguage, calendarLocalToday, updateCalendarWidget]);"}]},{"path":"src/screens/ChurchCalendarScreen.js","changes":[{"before":"import {useFocusEffect} from '@react-navigation/native';","after":"import {useFocusEffect} from '@react-navigation/native';\nimport {useCalendarTodayRollover, shouldAdvanceSelectedDay} from '../hooks/useCalendarTodayRollover';"},{"before":"  const [selectedDate, setSelectedDate] = useState(toCalendarDate(initial));","after":"  const [selectedDate, setSelectedDate] = useState(toCalendarDate(initial));\n  const selectedDateRef = useRef(selectedDate);\n  selectedDateRef.current = selectedDate;\n\n  const calendarTodayKey = useCalendarTodayRollover((previousToday, currentToday) => {\n    // Only advance if this screen was actually displaying the old today.\n    // Historical dates selected manually or opened via a shared link stay put.\n    if (!shouldAdvanceSelectedDay(selectedDateRef.current, previousToday)) return;\n    selectedDateRef.current = currentToday;\n    setSelectedDate(currentToday);\n    if (visibleYear + '-' + String(visibleMonth).padStart(2, '0') ===\n        previousToday.slice(0, 7)) {\n      const [year, month] = currentToday.split('-').map(Number);\n      setVisibleYear(year);\n      setVisibleMonth(month);\n    }\n  });"},{"before":"  const today = toCalendarDate(new Date());","after":"  const today = calendarTodayKey;"}]}];
const apply=(text,entry)=>{
  let next=text.replace(/\r\n/g,'\n');
  for(const [index,part] of entry.changes.entries()){
    const after=next.split(part.after).length-1;
    const before=next.split(part.before).length-1;
    if(after===1)continue;
    if(after===0&&before===1)next=next.replace(part.before,part.after);
    else throw Error(entry.path+': changed local source at step '+(index+1)+
      '. Nothing was written. Send this error for a safe merge.');
  }
  return next.replace(/\n/g,text.includes('\r\n')?'\r\n':'\n');
};
const planned=patches.map(entry=>{
  const file=path.join(root,entry.path);
  const original=fs.readFileSync(file,'utf8');
  return {file,entry,original,updated:apply(original,entry)};
});
const changed=planned.filter(x=>x.original!==x.updated);
if(!changed.length){console.log('PASS: calendar rollover already installed.');process.exit(0)}
const backupDir=path.resolve(root,'..','build-backups',
 'calendar-date-rollover-before-'+new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(backupDir,{recursive:true});
for(const item of changed)fs.copyFileSync(item.file,
 path.join(backupDir,item.entry.path.replace(/[\\/]/g,'__')));
const done=[];
try{for(const item of changed){fs.writeFileSync(item.file,item.updated,'utf8');done.push(item)}}
catch(e){for(const item of done)fs.writeFileSync(item.file,item.original,'utf8');throw e}
console.log('PASS: midnight, resume and focus today updates installed.');
console.log('Updated:',changed.map(x=>x.entry.path).join(', '));
console.log('Backups:',backupDir);
