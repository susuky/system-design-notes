/* Interactive system-design scenarios: all numbers are deterministic teaching inputs. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.SystemDesignScenes = api;
    if (typeof document !== 'undefined') {
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => api.init(document), {once: true});
      else api.init(document);
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const copy = value => JSON.parse(JSON.stringify(value));
  const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const round = (x, digits = 2) => Number(x.toFixed(digits));
  const node = (name, value, kind = '') => ({name, value: String(value), kind});
  const frame = (title, why, nodes, metrics, focus = 0) => ({title, why, nodes, metrics, focus});
  const definitions = {
    capacity: {title:'每天一百萬份文件，需要多少核心？', label:'每日文件（百萬份）', min:1,max:5,value:1,unit:'百萬份',options:['每份2 CPU-seconds','最佳化成1 CPU-second']},
    slo: {title:'讓每一份到期工作進入分母',label:'五分鐘內失敗或逾時',min:0,max:30,value:10,unit:'份／1000份',options:['99%目標','99.9%目標']},
    zones: {title:'拿掉一個AZ，流量會去哪裡？',label:'每區平時使用率',min:20,max:90,value:60,unit:'%',options:['三個副本分在三區','兩個副本放同一區']},
    ack: {title:'從接受任務走到可取用的結果',label:'OCR處理時間',min:1,max:60,value:30,unit:'秒',options:['先保存任務再接受','提交後回覆遺失']},
    cache: {title:'讀到v1的請求，比v2晚回來',label:'舊讀取延遲',min:1,max:5,value:3,unit:'拍',options:['舊值直接回填','回填檢查版本']},
    queue: {title:'流量相同，完成量改一點會怎樣？',label:'每秒到達工作',min:20,max:100,value:70,unit:'份',options:['每秒完成40份','每秒完成80份']},
    storage: {title:'在三個時間點切斷電源',label:'崩潰時間點',min:1,max:3,value:2,unit:'階段',options:['WAL同步後回ACK','進記憶體就回ACK']},
    delivery: {title:'從事件41斷線，接著補哪幾筆？',label:'離線期間新增事件',min:1,max:6,value:3,unit:'筆',options:['保留事件可補播','舊游標超出保留範圍']},
    retries: {title:'三層都重試，底層收到幾次？',label:'每層總嘗試次數',min:1,max:4,value:3,unit:'次',options:['每層各自重試','只在最外層重試']},
    batching: {title:'湊一批，第一筆等多久？',label:'每批最多筆數',min:1,max:6,value:4,unit:'筆',options:['等待上限25ms','等待上限5ms']},
    sharding: {title:'熱租戶占住一個分區',label:'熱租戶每秒工作',min:0,max:300,value:180,unit:'份',options:['同租戶集中一區','按文件拆熱租戶']},
    autoscale: {title:'新worker還沒就緒，積壓繼續增加',label:'新容量啟動延遲',min:0,max:180,value:120,unit:'秒',options:['新容量120份／秒','新容量160份／秒']},
    breaker: {title:'故障、斷路、試探、恢復',label:'連續失敗門檻',min:2,max:5,value:3,unit:'次',options:['探測成功','探測再失敗']},
    fanout: {title:'一個慢請求拖住全部扇出',label:'同時等待的下游數',min:1,max:100,value:20,unit:'個',options:['每個1%機率超時','每個0.1%機率超時']},
    shortener: {title:'短網址停用了，舊回填還能導向嗎？',label:'快取TTL',min:5,max:60,value:30,unit:'秒',options:['只靠TTL','撤銷版本擋舊回填']},
    auth: {title:'知道文件ID的人，能讀取它嗎？',label:'權杖剩餘有效期',min:0,max:60,value:30,unit:'分鐘',options:['讀自己的文件','換成另一租戶文件']}
  };
  const models = {
    capacity(n, mode) {
      const day=n*1e6, avg=day/86400, peak=avg*10, cost=mode?1:2, demand=peak*cost, cores=Math.ceil(demand/.7);
      return [
        frame('先看輸入','每天文件數決定平均負載；工作大小和每份成本另外帶入。',[node('客戶',day.toLocaleString()+'份／日'),node('API','接受任務'),node('worker','尚未估算'),node('儲存',n*5+' TB／日')],{'每日文件':day,'每份原件':'5 MB'},0),
        frame('換成每秒','一天有86400秒。每日總量除以秒數，得到平均到達率。',[node('客戶',round(avg)+'份／秒'),node('API','日均流量'),node('worker','等待容量估算'),node('儲存',n*5+' TB／日')],{'日均到達率':round(avg)+'／秒','尖峰倍率':'10倍'},1),
        frame('把尖峰帶進來','短時間尖峰按日均十倍計；接收、網路和運算都要跟著這個負載檢查。',[node('客戶',round(peak)+'份／秒','warning'),node('API','尖峰輸入'),node('worker',cost+' CPU-s／份'),node('儲存',round(peak*5)+' MB／秒')],{'尖峰到達率':round(peak)+'／秒','原件流入':round(peak*5)+' MB／秒'},1),
        frame('用工作成本換容量','尖峰速率乘每份CPU-seconds，就是每秒需要的CPU-seconds。',[node('客戶',round(peak)+'份／秒'),node('API','已排程'),node('worker',round(demand)+' CPU-s／秒','active'),node('儲存','保存產物')],{'等效滿載核心':round(demand),'每份計算成本':cost+' CPU-s'},2),
        frame('留出70%使用率的空間','將計算需求除以0.7，再向上取整。改變每日量或每份成本，重新走一次推導。',[node('客戶',round(peak)+'份／秒'),node('API','依需求接收'),node('worker',cores+'等效核心','active'),node('儲存',n*150+' TB／30日')],{'規劃核心':cores,'目標使用率':'70%','30日原件':n*150+' TB'},2)
      ];
    },
    slo(n,mode) {
      const target=mode?.999:.99, allowed=1000*(1-target), good=1000-n;
      return [
        frame('固定分母','本視窗有1000份工作到達各自的五分鐘截止時間。',[node('已接受','1000份'),node('截止時間','已全部到期'),node('成功完成','準備計算'),node('SLO',target*100+'%')],{'到期工作':1000,'目標':target*100+'%'},1),
        frame('把未達標工作算進來','失敗、仍在排隊和超時成功，都屬於五分鐘內未成功的工作。',[node('已接受','1000份'),node('到期未成功',n+'份',n?'warning':''),node('準時成功',good+'份','active'),node('SLO',target*100+'%')],{'成功分子':good,'完整分母':1000},2),
        frame('算成功比例','分子除以分母，計算這個視窗的服務結果。',[node('準時成功',good+'份'),node('全部到期','1000份'),node('本次結果',round(good/10)+'%',good/1000>=target?'active':'warning'),node('SLO',target*100+'%')],{'本次成功率':round(good/10)+'%','未達標預算':round(allowed)+'份'},2),
        frame('看還剩多少預算',n<=allowed?'本視窗在目標內，剩餘預算等於允許未達標量減掉已發生量。':'未達標量超過本視窗預算，回到排隊、失敗和超時來源找最大改善點。',[node('準時成功',good+'份'),node('未達標',n+'份'),node('預算差額',round(allowed-n)+'份',n<=allowed?'active':'warning'),node('下一步','定位等待與失敗')],{'預算差額':round(allowed-n),'是否達標':n<=allowed?'是':'否'},2)
      ];
    },
    zones(n,mode) {
      const share=n*1.5, votes=mode?1:2;
      return [
        frame('正常分配','三個AZ分擔同一批流量，每區使用率相同。',[node('流量','分成三份'),node('AZ A',n+'% / '+(mode?'2副本':'1副本')),node('AZ B',n+'% / 1副本'),node('AZ C',n+'% / '+(mode?'0副本':'1副本'))],{'每區使用率':n+'%','多數門檻':'2／3'},0),
        frame('AZ A失效','移除A的容量與其中副本，觀察剩下的票數。',[node('流量','全部轉到B、C'),node('AZ A','離線','warning'),node('AZ B','存活'),node('AZ C','存活')],{'存活副本':votes,'所需票數':2},1),
        frame('剩下兩區接流量','每區接收原本1.5倍的流量；原先使用率越高，故障後越容易超出容量。',[node('流量','總量不變'),node('AZ A','離線','warning'),node('AZ B',share+'%',share>100?'warning':'active'),node('AZ C',share+'%',share>100?'warning':'active')],{'故障後每區使用率':share+'%','額外負載':'50%'},2),
        frame('一起看票數和容量',votes>=2?'副本仍可形成多數；是否維持吞吐再看剩餘容量。':'A帶走兩個副本，剩下一票，需停止需要多數確認的寫入。',[node('副本確認',votes+'/3票',votes>=2?'active':'warning'),node('AZ A','離線','warning'),node('AZ B',share+'%',share>100?'warning':'active'),node('AZ C',share+'%',share>100?'warning':'active')],{'可形成多數':votes>=2?'是':'否','容量足夠':share<=100?'是':'否'},0)
      ];
    },
    ack(n,mode) {
      return [
        frame('提交','客戶送出穩定操作ID J1。',[node('客戶','J1等待'),node('API','接收'),node('任務庫','無J1'),node('worker','尚未開始')],{'經過時間':'0秒','狀態':'尚未接受'},1),
        frame('保存任務','任務與outbox發送意圖一起提交。從這個狀態開始，服務可恢復處理。',[node('客戶','J1等待'),node('API','交易已提交'),node('任務庫','J1 queued','active'),node('worker','待領取')],{'已保存任務':1,'已完成':0},2),
        frame(mode?'回覆在路上遺失':'回傳202',mode?'客戶尚未收到任務ID，使用相同操作ID重試可找到原任務。':'客戶取得job_id；畫面顯示已提交，並可查進度。',[node('客戶',mode?'逾時，重試J1':'已提交',mode?'warning':'active'),node('API',mode?'找回既有J1':'202 + J1'),node('任務庫','J1 queued'),node('worker','開始領取')],{'任務總數':1,'已完成':0},0),
        frame('背景執行','OCR消耗自己的處理時間，狀態查詢可以繼續回覆進度。',[node('客戶','查J1進度'),node('API','GET狀態'),node('任務庫','J1 running'),node('worker','OCR '+n+'秒','active')],{'處理時間':n+'秒','狀態':'running'},3),
        frame('結果可取用','結果已保存並提交succeeded，查詢現在回傳結果位置與版本。',[node('客戶','取得結果','active'),node('API','200 succeeded'),node('任務庫','J1 succeeded'),node('worker','結果v1已保存')],{'任務總數':1,'已完成':1,'狀態':'succeeded'},0)
      ];
    },
    cache(n,mode) {
      return [
        frame('舊讀取先開始','A在t=0取得資料庫v1，回填被延遲。',[node('讀者A','持有v1'),node('資料庫','v1'),node('快取','空'),node('寫者B','等待更新')],{'A回填時間':'t='+n,'已知版本':1},0),
        frame('B提交v2','B先提交新值，再刪除舊快取；版本檢查模式同時保留最低可接受版本2。',[node('讀者A','v1在途'),node('資料庫','v2','active'),node('快取',mode?'空，最低v2':'空'),node('寫者B','提交完成')],{'資料庫版本':2,'快取版本':'空'},1),
        frame('A終於回填',mode?'A攜帶v1，低於最低版本2；原子版本比較拒絕這次舊回填。':'A把先前取得的v1寫回快取，下一位讀者可能讀到舊值。',[node('讀者A','t='+n+'回填v1'),node('資料庫','v2'),node('快取',mode?'拒絕v1':'v1',mode?'active':'warning'),node('寫者B','已完成')],{'資料庫版本':2,'快取版本':mode?'空':1},2),
        frame('下一次讀取',mode?'快取miss，讀資料庫v2並回填v2；新讀者取得新值。':'快取命中v1；失效發生過，較晚的舊回填仍改變了後續讀取。',[node('新讀者',mode?'取得v2':'取得v1',mode?'active':'warning'),node('資料庫','v2'),node('快取',mode?'v2':'v1'),node('版本政策',mode?'只向前':'直接覆寫')],{'讀者版本':mode?2:1,'資料庫版本':2,'是否落後':mode?'否':'是'},0)
      ];
    },
    queue(n,mode) {
      const service=mode?80:40,frames=[];let backlog=0,done=0,offered=0;
      frames.push(frame('空佇列開始','每拍代表一秒。前三拍使用設定尖峰，後三拍降到每秒30份。',[node('來源',n+'份／秒'),node('佇列','0份'),node('worker',service+'份／秒'),node('已完成','0份')],{'時間':'0秒','積壓':0,'完成':0},0));
      for(let t=1;t<=6;t++){
        const arrival=t<=3?n:30;offered+=arrival;const completed=Math.min(backlog+arrival,service);backlog+=arrival-completed;done+=completed;
        frames.push(frame('第'+t+'秒',arrival>service?'新工作比完成量多，差額累積在隊列。':backlog?'多出的處理能力正在清舊工作。':'完成本拍可用工作後，剩餘容量閒置。',
        [node('來源',arrival+'份'),node('佇列',backlog+'份',backlog?'warning':''),node('worker','本拍完成'+completed),node('已完成',done+'份','active')],{'時間':t+'秒','總到達':offered,'積壓':backlog,'總完成':done},1));
      }return frames;
    },
    storage(n,mode) {
      const frames=[frame('原本保存v1','客戶準備把D更新成v2，目前持久狀態仍是v1。',[node('客戶','準備更新'),node('記憶體','尚無v2'),node('WAL','尚無v2'),node('資料頁','D=v1')],{'階段':0,'已確認':'否','可重播v2':'否'},0)];
      frames.push(frame('進入程序記憶體',mode?'此模式已回ACK，現在立刻斷電會失去已確認更新。':'變更先進記憶體，暫時保留回覆。',[node('客戶',mode?'已收到ACK':'等待'),node('記憶體','D=v2'),node('WAL','尚未同步'),node('資料頁','D=v1')],{'階段':1,'已確認':mode?'是':'否','可重播v2':'否'},1));
      if(n>=2)frames.push(frame('WAL同步完成','復原所需記錄已到穩定儲存；等待WAL的模式現在回ACK。',[node('客戶','已收到ACK'),node('記憶體','D=v2'),node('WAL','v2已同步','active'),node('資料頁','D=v1')],{'階段':2,'已確認':'是','可重播v2':'是'},2));
      if(n>=3)frames.push(frame('更新資料頁','資料頁追上v2；WAL和資料頁一起描述可恢復狀態。',[node('客戶','已收到ACK'),node('記憶體','D=v2'),node('WAL','v2已同步'),node('資料頁','D=v2','active')],{'階段':3,'已確認':'是','可重播v2':'是'},3));
      const recovered=n>=2;
      frames.push(frame('斷電重啟',recovered?'WAL有v2，資料頁若落後就重播，讀取恢復為v2。':mode?'記憶體消失且WAL尚未同步，讀回v1；客戶先前已收到ACK。':'記憶體消失，讀回v1；客戶尚未收到成功，可用原操作ID重試。',[node('客戶',mode||recovered?'先前有ACK':'先前未ACK'),node('記憶體','重新建立'),node('WAL',recovered?'可重播v2':'沒有v2'),node('恢復結果',recovered?'D=v2':'D=v1',recovered?'active':'warning')],{'恢復版本':recovered?2:1,'已確認更新遺失':mode&&!recovered?'是':'否'},3));return frames;
    },
    delivery(n,mode) {
      const newest=41+n;
      return [
        frame('已處理41','客戶顯示event41對應狀態，保存最後已處理的位置。',[node('事件庫','最後41'),node('gateway','連線中'),node('客戶','已處理41'),node('游標','41')],{'客戶游標':41,'伺服器最新':41},2),
        frame('客戶離線','服務繼續產生事件；持久化的事件位置獨立於這條連線。',[node('事件庫','42到'+newest),node('gateway','斷線','warning'),node('客戶','離線'),node('游標','41')],{'客戶游標':41,'伺服器最新':newest,'待補':n},1),
        frame('帶游標重連',mode?'游標41超出保留範圍，改取最新快照，再接後續事件。':'伺服器從42開始補送；若41再次抵達，客戶辨認為已處理事件。',[node('事件庫',mode?'快照v'+newest:'補送42到'+newest),node('gateway','重新路由'),node('客戶','恢復狀態','active'),node('游標','41')],{'恢復方式':mode?'快照':'重播','目標版本':newest},2),
        frame('接上最新進度','客戶完成套用後才前進游標。下一次斷線就從這個位置繼續。',[node('事件庫','最新'+newest),node('gateway','持續送新事件'),node('客戶','已處理'+newest,'active'),node('游標',newest)],{'客戶游標':newest,'伺服器最新':newest,'待補':0},3)
      ];
    },
    retries(n,mode) {
      const calls=mode?[1,n,n,n]:[1,n,n*n,n*n*n];
      return [
        frame('一次使用者操作','A、B與資料庫驅動各有一層嘗試；原始操作ID保持相同。',[node('使用者','1次操作'),node('服務A','外層重試'),node('服務B','中間重試'),node('資料庫驅動','最內層重試'),node('資料庫','等待查詢')],{'總層數':3,'每層總嘗試':n},0),
        frame('A向B發出嘗試',mode?'A掌握全部重試預算；B與資料庫驅動每次只送出一次。':'A最多向B呼叫'+n+'次；每次進入B後，會再使用B自己的重試預算。',[node('使用者','1次操作'),node('服務A','送出'+calls[1]+'次','active'),node('服務B','收到'+calls[1]+'次'),node('資料庫驅動','等待'),node('資料庫','等待')],{'A呼叫下游':calls[1]},1),
        frame('B呼叫資料庫驅動',mode?'B每次只呼叫驅動一次，驅動共收到'+n+'次。':'B每次最多呼叫驅動'+n+'次；驅動共收到'+n+'×'+n+'='+calls[2]+'次。',[node('使用者','1次操作'),node('服務A','送出'+calls[1]+'次'),node('服務B','送出'+calls[2]+'次','active'),node('資料庫驅動','收到'+calls[2]+'次'),node('資料庫','等待')],{'B呼叫量':calls[2]},2),
        frame('驅動把查詢送到資料庫',mode?'驅動每次只查詢一次，底層最多收到'+n+'次；A統一管理總期限與退避。':'驅動收到的每次呼叫又最多查詢'+n+'次，資料庫合計承受'+calls[3]+'次嘗試。',[node('使用者','1次操作'),node('服務A','送出'+calls[1]+'次'),node('服務B','送出'+calls[2]+'次'),node('資料庫驅動','送出'+calls[3]+'次'),node('資料庫',calls[3]+'次查詢',mode?'active':'warning')],{'底層最大呼叫':calls[3],'相對原始流量':calls[3]+'倍'},4)
      ];
    },
    batching(n,mode) {
      const wait=mode?5:25,arrivals=[0,10,20,30,40,50],batches=[],frames=[];let pending=[],start=null;
      function flush(time){if(!pending.length)return;const ids=pending.slice();batches.push({ids,time});pending=[];start=null;frames.push(frame('送出第'+batches.length+'批','達筆數或等待上限就送出，這批共'+ids.length+'筆；每批固定成本設定為2ms。',[node('來源','6筆，每10ms到一筆'),node('緩衝區','空'),node('本批',ids.join('、'),'active'),node('接收端',batches.length+'次批次')],{'送出時間':time+'ms','本批筆數':ids.length,'本批最久等待':time-arrivals[ids[0]-1]+'ms','累計固定成本':batches.length*2+'ms'},2));}
      frames.push(frame('開始收集','同一筆交易的工作以10ms間隔到達，任一門檻達成即送出。',[node('來源','6筆'),node('緩衝區','空'),node('門檻',n+'筆／'+wait+'ms'),node('接收端','等待')],{'每批上限':n,'最大等待':wait+'ms'},0));
      arrivals.forEach((time,i)=>{if(start!==null&&start+wait<=time)flush(start+wait);if(start===null)start=time;pending.push(i+1);if(pending.length>=n)flush(time);});if(pending.length)flush(start+wait);
      frames.push(frame('計算攤薄效果','六筆都交付。較大的批次減少固定開銷，等待上限決定低流量時的最久等待。',[node('來源','6筆全部送達'),node('緩衝區','空'),node('批次總數',batches.length,'active'),node('固定開銷',batches.length*2+'ms')],{'總筆數':6,'批次數':batches.length,'固定成本／筆':round(batches.length*2/6)+'ms'},3));
      return frames;
    },
    sharding(n,mode) {
      const other=120,loads=Array.from({length:4},(_,i)=>other/4+(mode?n/4:i===0?n:0));
      return [
        frame('普通租戶平均分配','普通租戶合計每秒120份，平均每個分區30份；每區容量100份／秒。',[node('普通租戶','120／秒'),node('分區0','30'),node('分區1','30'),node('分區2','30'),node('分區3','30')],{'每區容量':'100／秒','普通流量':'120／秒'},0),
        frame('熱租戶進來',mode?'熱租戶工作依文件拆到四區；同一文件仍保持固定路由。':'以租戶為key，熱租戶全部進分區0。',[node('熱租戶',n+'／秒'),...loads.map((v,i)=>node('分區'+i,v+'／秒',v>100?'warning':'active'))],{'總流量':n+other,'最熱分區':Math.max(...loads)},0),
        frame('看局部容量','其他區仍有空位時，熱區也可能排隊。拆key會改變可維持順序與聚合的位置。',[node('路由方式',mode?'按文件':'按租戶'),...loads.map((v,i)=>node('分區'+i,v+'／秒',v>100?'warning':'active'))],{'最熱區超量':Math.max(0,Math.max(...loads)-100),'總容量':400,'總流量':n+other},loads.indexOf(Math.max(...loads))+1)
      ];
    },
    autoscale(n,mode) {
      const incoming=100,old=60,newCap=mode?160:120,frames=[];let q=0;
      frames.push(frame('發現過載','到達100份／秒，舊容量60份／秒，每秒多排40份。',[node('來源','100／秒'),node('舊worker','60／秒'),node('新worker','準備啟動'),node('積壓','0份')],{'經過時間':0,'積壓':0},1));
      for(const fraction of [.5,1]) {const time=n*fraction;q=(incoming-old)*time;frames.push(frame(fraction===1?'新容量就緒':'等待啟動','啟動前仍由舊容量承載，新增容量尚未完成任何工作。',[node('來源','100／秒'),node('舊worker','60／秒'),node('新worker',fraction===1?'總容量升到'+newCap:'載入中'),node('積壓',q+'份',q?'warning':'')],{'經過時間':time+'秒','積壓':q,'舊容量':old},2));}
      const drain=q/(newCap-incoming);
      frames.push(frame('計算清空時間','新總容量扣掉新到達量，剩下的差額用來清舊工作。',[node('來源','100／秒'),node('總worker',newCap+'／秒','active'),node('淨消化',newCap-incoming+'／秒'),node('積壓',q+'份')],{'淨消化速度':newCap-incoming,'還要清空':round(drain)+'秒','從開始到清空':round(n+drain)+'秒'},2));
      frames.push(frame('追上進度','積壓歸零後，只需處理持續到達的新工作。',[node('來源','100／秒'),node('總worker',newCap+'／秒'),node('閒餘容量',newCap-incoming+'／秒'),node('積壓','0份','active')],{'經過時間':round(n+drain)+'秒','積壓':0},3));return frames;
    },
    breaker(n,mode) {
      const frames=[frame('Closed正常放行','狀態以連續失敗次數示範，這次門檻為'+n+'。',[node('客戶','新請求'),node('斷路器','Closed'),node('下游','正在故障'),node('結果','準備觀察')],{'連續失敗':0,'門檻':n},1)];
      for(let k=1;k<=n;k++)frames.push(frame('第'+k+'次失敗',k===n?'失敗累積達門檻，切到Open。':'呼叫失敗，累積計數。',[node('客戶','收到失敗'),node('斷路器',k===n?'Open':'Closed',k===n?'warning':''),node('下游','失敗'),node('計數',k+'/'+n)],{'連續失敗':k,'狀態':k===n?'Open':'Closed'},1));
      frames.push(frame('Open直接回覆','冷卻期間不呼叫下游，客戶立即取得依賴暫時不可用的結果。',[node('客戶','立即取得失敗'),node('斷路器','Open','warning'),node('下游','冷卻中'),node('下游新增呼叫','0')],{'狀態':'Open','本次下游呼叫':0},1));
      frames.push(frame('Half-open少量探測','冷卻結束後，允許一個探測請求通過。',[node('客戶','一個探測'),node('斷路器','Half-open','active'),node('下游','測試中'),node('其他請求','維持拒絕')],{'狀態':'Half-open','探測數':1},2));
      frames.push(frame(mode?'探測失敗，再次冷卻':'探測成功，恢復放行',mode?'回到Open並重新等待冷卻，避免恢復中的下游立刻吃滿流量。':'這個教學政策採一個成功探測後回Closed；生產政策可要求更多樣本。',[node('客戶',mode?'暫時失敗':'重新放行'),node('斷路器',mode?'Open':'Closed',mode?'warning':'active'),node('下游',mode?'仍失敗':'已恢復'),node('計數',mode?n:0)],{'狀態':mode?'Open':'Closed','連續失敗':mode?n:0},1));return frames;
    },
    fanout(n,mode) {
      const p=mode?.001:.01,prob=1-(1-p)**n;
      return [
        frame('一個下游','假設每個下游超過門檻的機率固定，且各請求獨立。',[node('主請求','等待'),node('下游1',p*100+'%超時'),node('整體結果','等待此結果')],{'下游數':1,'至少一個超時':p*100+'%'},1),
        frame('同時扇出到'+n+'個','主請求等待全部結果；任何一個慢，都會拉長整體等待。',[node('主請求','等待全部'),node('下游群組',n+'個並行'),node('整體結果','由最慢者決定')],{'下游數':n,'全部及時機率':round((1-p)**n*100)+'%'},1),
        frame('補集計算','至少一個超時＝1−全部及時＝1−(1−p)^n。調整下游數可直接看到尾延遲被放大。',[node('每個及時',(1-p)*100+'%'),node('全部及時',round((1-p)**n*100)+'%'),node('至少一個超時',round(prob*100)+'%',prob>.1?'warning':'active')],{'至少一個超時':round(prob*100)+'%','公式':'1 − (1 − p)^n'},2),
        frame('回到產品需要的結果','若畫面可先顯示部分結果，就改成等待必要子集；若需要全部，優先改善最慢依賴與扇出數。',[node('需求','全部／必要子集'),node('依賴數',n),node('可觀測訊號','端到端延遲')],{'獨立假設下超時率':round(prob*100)+'%','判斷依據':'完整請求分布'},0)
      ];
    },
    shortener(n,mode) {
      return [
        frame('短鏈仍有效','權威資料v7有效，舊讀者A取得目的網址後暫停。',[node('訪客A','持有v7'),node('權威資料','v7有效'),node('快取','空'),node('管理者','準備停用')],{'快取TTL':n+'秒','權威版本':7},0),
        frame('管理者停用','資料更新為v8撤銷；版本模式在快取路徑保存撤銷下限。',[node('訪客A','v7仍在途'),node('權威資料','v8撤銷','warning'),node('快取',mode?'最低版本8':'已刪除'),node('管理者','停用成功')],{'權威版本':8,'狀態':'撤銷'},1),
        frame('v7晚一步回填',mode?'低於撤銷版本8的回填被原子比較拒絕。':'舊讀者把v7重新放入快取，TTL從這次回填開始計。',[node('訪客A','回填v7'),node('權威資料','v8撤銷'),node('快取',mode?'拒絕v7':'v7可導向',mode?'active':'warning'),node('TTL',mode?'無舊快取':n+'秒')],{'舊回填結果':mode?'拒絕':'保存','可能舊回應期間':mode?0:n},2),
        frame('下一位訪客',mode?'miss後讀到撤銷狀態，回覆短鏈停用。':'在這個快取模型內，TTL到期前可能仍使用舊導向；到期後回源取得撤銷。',[node('新訪客',mode?'短鏈停用':'可能被導向',mode?'active':'warning'),node('權威資料','v8撤銷'),node('快取',mode?'撤銷狀態':'v7等TTL'),node('治理條件','選撤銷傳播上限')],{'是否立即停用':mode?'是':'否','TTL':n+'秒'},0)
      ];
    },
    auth(n,mode) {
      const expired=n===0,allowed=!expired&&!mode;
      return [
        frame('請求進來','客戶攜帶權杖讀文件D。權杖代表租戶A，文件可能屬於A或B。',[node('客戶','tenant A'),node('權杖',n+'分鐘'),node('文件D',mode?'tenant B':'tenant A'),node('API','準備驗證')],{'剩餘效期':n+'分鐘','文件租戶':mode?'B':'A'},0),
        frame('驗證權杖','依服務的允許演算法與金鑰驗簽，再檢查issuer、audience與到期時間。',[node('客戶','tenant A'),node('權杖',expired?'已到期':'驗證通過',expired?'warning':'active'),node('文件D',mode?'tenant B':'tenant A'),node('API',expired?'回401':'接著檢查物件權限')],{'身份驗證':expired?'失敗':'通過'},1),
        frame(expired?'停止於身份邊界':'檢查這份文件的權限',expired?'到期權杖先更新身份憑證，再發出新的讀取。':mode?'有效身份屬於A，文件屬於B，租戶邊界拒絕這次讀取。':'查詢條件同時限定文件ID與tenant A，得到允許存取的文件。',[node('客戶','tenant A'),node('權杖',expired?'失效':'有效'),node('文件D',mode?'tenant B':'tenant A'),node('API',expired?'401':mode?'403／隱藏存在性':'200',allowed?'active':'warning')],{'結果':expired?'身份失效':mode?'物件權限拒絕':'允許','文件是否回傳':allowed?'是':'否'},3)
      ];
    }
  };

  const mounted = new WeakMap();
  const active = new Set();
  let boundDocument = null;
  function graphHTML(current, key, compact = false) {
    const count = current.nodes.length;
    const branches = key === 'zones' || key === 'sharding';
    const viewWidth = compact ? 320 : 744;
    const nodeWidth = compact ? 140 : branches && count === 5 ? 163 : 190;
    const nodeHeight = compact ? 68 : 76;
    const layouts = compact ? {
      3: [[12, 18], [168, 18], [168, 116]],
      4: [[12, 18], [168, 18], [168, 116], [12, 116]],
      5: [[12, 18], [168, 18], [168, 116], [12, 116], [12, 214]]
    } : {
      3: [[26, 68], [277, 68], [528, 68]],
      4: [[70, 21], [484, 21], [484, 139], [70, 139]],
      5: [[26, 21], [277, 21], [528, 21], [528, 139], [277, 139]]
    };
    let positions = layouts[count];
    if (branches) {
      const span = (viewWidth - 36 - nodeWidth) / (count - 2);
      positions = compact
        ? [[12, 18], ...Array.from({length: count - 1}, (_, index) => [168, 18 + index * 88])]
        : [[(viewWidth - nodeWidth) / 2, 12], ...Array.from({length: count - 1}, (_, index) => [18 + span * index, 141])];
    }
    const viewHeight = Math.max(...positions.map(position => position[1])) + nodeHeight + (compact ? 18 : 23);
    const relations = branches ? Array.from({length: count - 1}, (_, index) => [0, index + 1])
      : key === 'cache' || key === 'shortener' ? [[0, 1], [3, 1], [0, 2]]
      : key === 'auth' ? [[0, 3], [1, 3], [2, 3]]
      : Array.from({length: count - 1}, (_, index) => [index, index + 1]);
    const arrows = relations.map(([from, to]) => {
      const [x1, y1] = positions[from];
      const [x2, y2] = positions[to];
      const startMidY = y1 + nodeHeight / 2;
      const endMidY = y2 + nodeHeight / 2;
      let path;
      if (branches && compact) {
        path = `M${x1 + nodeWidth} ${startMidY} H160 V${endMidY} H${x2 - 3}`;
      } else if (y1 === y2) {
        path = x1 < x2 ? `M${x1 + nodeWidth} ${startMidY} H${x2 - 3}` : `M${x1} ${startMidY} H${x2 + nodeWidth + 3}`;
      } else {
        const sx = x1 + nodeWidth / 2;
        const ex = x2 + nodeWidth / 2;
        const forward = y1 < y2;
        const sy = forward ? y1 + nodeHeight : y1;
        const ey = forward ? y2 - 3 : y2 + nodeHeight + 3;
        const mid = branches ? 113 : (sy + ey) / 2 + (from === 0 ? -3 : 3);
        path = `M${sx} ${sy} V${mid} H${ex} V${ey}`;
      }
      const isActive = from === current.focus || to === current.focus;
      const tone = isActive ? current.nodes[to].kind === 'warning' ? 'warning' : 'active' : 'idle';
      return `<path class="scene-edge scene-edge-${tone}" d="${path}" marker-end="url(#scene-arrow-${key}-${tone})"/>`;
    }).join('');
    const glyphs = [
      [/快取|回填/, 'cache'],
      [/WAL|資料庫|資料頁|資料|儲存|存放|副本|日誌|事件庫/, 'db'],
      [/佇列|隊列|積壓|緩衝|排隊/, 'queue'],
      [/客戶|用戶|使用者|訪客|來源|上傳|讀者/, 'client'],
      [/下游|AZ|分區|worker|核心|硬體|主機|容量/i, 'server'],
      [/API|gateway|路由|斷路|寫入|驅動/i, 'router'],
      [/完成|結果|成功|判準|計算/, 'check'],
    ];
    function textLine(value, className, x, y, maxWidth, fontSize) {
      const width = [...String(value)].reduce((sum, char) => sum + (char.charCodeAt(0) < 256 ? fontSize * .57 : fontSize), 0);
      const fit = width > maxWidth ? ` textLength="${maxWidth}" lengthAdjust="spacingAndGlyphs"` : '';
      return `<text class="${className}" x="${x}" y="${y}"${fit}>${esc(value)}</text>`;
    }
    const nodes = current.nodes.map((item, index) => {
      const [x, y] = positions[index];
      const glyph = glyphs.find(([pattern]) => pattern.test(item.name))?.[1] || 'activity';
      const focused = index === current.focus ? ' is-active' : '';
      const iconSize = compact ? 23 : 34;
      const valueX = compact ? 10 : 58;
      const nameX = compact ? 39 : 58;
      return `<g class="scene-node ${esc(item.kind)}${focused}" transform="translate(${x} ${y})">
        <rect class="scene-box" width="${nodeWidth}" height="${nodeHeight}" rx="10"/>
        <rect class="scene-glyph-bg" x="10" y="${compact ? 10 : 21}" width="${iconSize}" height="${iconSize}" rx="5"/>
        <use class="scene-glyph" href="#sd-icon-${glyph}" x="${compact ? 14 : 17}" y="${compact ? 14 : 28}" width="${compact ? 15 : 20}" height="${compact ? 15 : 20}"/>
        ${textLine(item.name, 'scene-node-name', nameX, compact ? 26 : 29, nodeWidth - nameX - 8, compact ? 13 : 15)}
        ${textLine(item.value, 'scene-node-value', valueX, compact ? 54 : 54, nodeWidth - valueX - 10, compact ? 15 : 17)}
      </g>`;
    }).join('');
    const alt = current.title + '：' + current.nodes.map(item => item.name + ' ' + item.value).join('，');
    return `<svg viewBox="0 0 ${viewWidth} ${viewHeight}" class="${compact ? 'scene-graph-compact' : 'scene-graph-wide'}" role="img" aria-labelledby="scene-graph-title-${key}">
      <title id="scene-graph-title-${key}">${esc(alt)}</title>
      <defs>${['idle', 'active', 'warning'].map(tone => `<marker id="scene-arrow-${key}-${tone}" markerWidth="6" markerHeight="6" refX="5.5" refY="3" orient="auto"><path class="scene-arrow-${tone}" d="M0 0 6 3 0 6Z"/></marker>`).join('')}</defs>
      ${arrows}${nodes}</svg>`;
  }
  function mount(container) {
    if(mounted.has(container))return mounted.get(container);
    const key=container.dataset.sdScene,definition=definitions[key];
    if(!definition || !models[key])return null;
    let frames=[],index=0,timer=null,playing=false;
    const id='sd-scene-'+key;
    container.innerHTML='<div class="scene-heading"><h4 id="'+id+'-title">'+esc(definition.title)+'</h4></div>'+
      '<div class="scene-stage"><div class="scene-visual"></div><div class="scene-narrative"><p class="scene-position"></p><h5 class="scene-phase"></h5><p class="scene-why" aria-live="polite" aria-atomic="true"></p></div></div>'+
      '<div class="scene-controls" role="group" aria-label="'+esc(definition.title)+'操作"><button type="button" data-scene-action="prev" aria-label="上一步：'+esc(definition.title)+'">上一步</button><button type="button" data-scene-action="next" aria-label="下一步：'+esc(definition.title)+'">下一步</button><button type="button" data-scene-action="play" aria-label="播放：'+esc(definition.title)+'">播放</button><button type="button" data-scene-action="reset" aria-label="重來：'+esc(definition.title)+'">重來</button></div>'+
      '<div class="scene-timeline" role="group" aria-label="'+esc(definition.title)+'步驟"></div><dl class="scene-metrics"></dl>'+
      '<div class="scene-inputs"><div><div class="scene-label"><label for="'+id+'-range">'+esc(definition.label)+'</label><output for="'+id+'-range" class="scene-value" aria-live="off"></output></div>'+
      '<input id="'+id+'-range" name="value" type="range" min="'+definition.min+'" max="'+definition.max+'" step="1" value="'+definition.value+'"></div>'+
      '<div><label for="'+id+'-mode">比較條件</label><select id="'+id+'-mode" name="mode">'+definition.options.map((text,i)=>'<option value="'+i+'">'+esc(text)+'</option>').join('')+'</select></div></div>';
    const $=selector=>container.querySelector(selector);
    const visual = $('.scene-visual');
    let compactGraph;
    const range=$('input'),select=$('select'),action=name=>$('[data-scene-action="'+name+'"]');
    function stop(){if(timer!==null)clearTimeout(timer);timer=null;playing=false;action('play').textContent='播放';action('play').setAttribute('aria-label','播放：'+definition.title);$('.scene-why').setAttribute('aria-live','polite');container.dataset.playing='false';}
    function updateDiagram(force = false) {
      const compact = visual.clientWidth > 0 && visual.clientWidth < 510;
      if (force || compact !== compactGraph) {
        compactGraph = compact;
        visual.innerHTML = graphHTML(frames[index], key, compact);
      }
    }
    function render(){
      const current=frames[index];
      updateDiagram(true);
      $('.scene-position').textContent=String(index+1).padStart(2,'0')+' / '+String(frames.length).padStart(2,'0');
      $('.scene-phase').textContent=current.title;
      $('.scene-why').textContent=current.why;
      $('.scene-metrics').innerHTML=Object.entries(current.metrics).map(([name,value])=>'<div><dt>'+esc(name)+'</dt><dd>'+esc(value)+'</dd></div>').join('');
      action('prev').disabled=index===0;action('next').disabled=index===frames.length-1;
      container.dataset.sceneStep=String(index);container.dataset.sceneTotal=String(frames.length);
      container.querySelectorAll('[data-scene-step]').forEach(button=>{
        const selected=Number(button.dataset.sceneStep)===index;
        button.setAttribute('aria-current',selected?'step':'false');
        button.classList.toggle('is-current',selected);
      });
    }
    function apply(keepPosition = false){
      stop();const n=Number(range.value),mode=Number(select.value);
      $('.scene-value').value=n+' '+definition.unit;
      $('.scene-value').textContent=n+' '+definition.unit;
      range.setAttribute('aria-valuetext',n+' '+definition.unit);
      frames=models[key](n,mode);index=keepPosition ? Math.min(index, frames.length-1) : 0;
      $('.scene-timeline').innerHTML=frames.map((item,i)=>'<button type="button" data-scene-step="'+i+'" aria-label="第'+(i+1)+'步：'+esc(item.title)+'">'+(i+1)+'</button>').join('');
      $('.scene-timeline').querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>{stop();index=Number(button.dataset.sceneStep);render();}));
      render();
    }
    function step(delta){stop();index=Math.max(0,Math.min(frames.length-1,index+delta));render();}
    function tick(){
      if(!playing)return;
      if(container.closest('[hidden]') || container.ownerDocument.visibilityState==='hidden'){stop();return;}
      if(index>=frames.length-1){stop();return;}
      index++;render();
      if(index>=frames.length-1)stop();else timer=setTimeout(tick,2600);
    }
    action('prev').addEventListener('click',()=>step(-1));
    action('next').addEventListener('click',()=>step(1));
    action('reset').addEventListener('click',()=>{stop();index=0;render();});
    action('play').addEventListener('click',()=>{
      if(playing){stop();return;}
      if(index===frames.length-1){index=0;render();}
      playing=true;action('play').textContent='暫停';action('play').setAttribute('aria-label','暫停：'+definition.title);$('.scene-why').setAttribute('aria-live','off');container.dataset.playing='true';timer=setTimeout(tick,2600);
    });
    range.addEventListener('input',()=>apply(true));select.addEventListener('change',()=>apply(true));
    const controller={stop,apply,step,reveal:updateDiagram,get index(){return index;},get frames(){return copy(frames);}};
    mounted.set(container,controller);active.add(controller);apply();return controller;
  }
  function init(doc) {
    const controllers=Array.from(doc.querySelectorAll('[data-sd-scene]')).map(mount).filter(Boolean);
    if(boundDocument!==doc){
      boundDocument=doc;
      const stopAll=()=>active.forEach(controller=>controller.stop());
      const revealAll=()=>active.forEach(controller=>controller.reveal());
      doc.addEventListener('course:route',()=>{stopAll();revealAll();});
      doc.addEventListener('visibilitychange',()=>{if(doc.visibilityState==='hidden')stopAll();});
      if(doc.defaultView){doc.defaultView.addEventListener('hashchange',stopAll);doc.defaultView.addEventListener('beforeprint',stopAll);doc.defaultView.addEventListener('resize',revealAll);}
    }
    return controllers;
  }
  return {definitions,models,graphHTML,mount,init};
});
