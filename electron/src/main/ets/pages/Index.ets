// Copyright (c) 2024 Huawei Device Co., Ltd. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import { WebWindow } from 'web_engine';
import { KeyCode } from '@kit.InputKit';
import CustomChildProcess from '../process/CustomChildProcess';

/** AI 生成合成内容显式标识：应用右下角常驻灰字（合规要求，勿删）。 */
const AI_NOTICE_TEXT: string = '内容由 AI 生成，仅供参考';
 
interface IStyleData {
  backgroundColor: string,
  opacity: number
};

interface IUpdateStyle {
  registerUpdateStyleFunction: Function,
  removeUpdateStyleFunction: Function
};

CustomChildProcess.toString();
let storage = LocalStorage.getShared();
@Entry(storage)
@Component
struct Index {
  @LocalStorageLink('updateStyle') updateStyle: IUpdateStyle = {
    registerUpdateStyleFunction: (id: string, initStyle: IStyleData, func: (style: IStyleData) => void) => {},
    removeUpdateStyleFunction: (id: string) => {}
  };
  @LocalStorageLink('xcomponentId') xcomponentId: string = '';

  private initStyle: IStyleData = {
    backgroundColor: 'ffffffff',
    opacity: 1
  };

  @State private backgroundColor_: string = `#${this.initStyle.backgroundColor}`;
  @State private opacity_: number = this.initStyle.opacity;

  aboutToAppear() {
    // registerUpdateStyleFunction
    this.updateStyle.registerUpdateStyleFunction(this.xcomponentId, this.initStyle, (style: IStyleData) => {
      this.backgroundColor_ = `#${style.backgroundColor}`;
      this.opacity_ = style.opacity;
    });
  }

  aboutToDisappear() {
    // removeUpdateStyleFunction
    this.updateStyle.removeUpdateStyleFunction(this.xcomponentId);
  }

  build() {
    Stack({ alignContent: Alignment.BottomEnd }) {
      Row() {
        WebWindow()
      }.onKeyEvent((event?: KeyEvent) => {
        if (event) {
          if (event.type == KeyType.Down && event.keyCode == KeyCode.KEYCODE_ESCAPE) {
            event.stopPropagation();
          }
          // 113-system-back：主界面由本地服务提供，系统返回键不应产生「返回/退出」语义 ——
          // stopPropagation 防系统默认导航/退出；渲染进程 BrowserBack 路径由 Electron 主进程
          // （installWindowShortcuts）另行派发 `pi-back`。双路径，⬜ 待验证（无真机）。
          if (event.type == KeyType.Down && event.keyCode == KeyCode.KEYCODE_BACK) {
            event.stopPropagation();
          }
        }
      })
      .backgroundColor(this.backgroundColor_)
      .opacity(this.opacity_)
      .width('100%')
      .height('100%')

      // AI 生成内容显式标识：常驻右下角灰字，HitTestMode.None 使其不拦截点击/键盘。
      Text(AI_NOTICE_TEXT)
        .fontSize(12)
        .fontColor('#8C8C8C')
        .opacity(0.6)
        .margin({ right: 12, bottom: 8 })
        .hitTestBehavior(HitTestMode.None)
    }
    .width('100%')
    .height('100%')
  }
}
