import {registerRootComponent} from 'expo';
import {
  registerWidgetConfigurationScreen,
  registerWidgetTaskHandler,
} from 'react-native-android-widget';

import App from './App';
import {QuoteWidgetConfigurationScreen} from './src/widgets/QuoteWidgetConfigurationScreen';
import {widgetTaskHandler} from './src/widgets/widgetTaskHandler';

registerRootComponent(App);

registerWidgetTaskHandler(widgetTaskHandler);

registerWidgetConfigurationScreen(
  QuoteWidgetConfigurationScreen
);