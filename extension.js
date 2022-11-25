/* exported init */

const GETTEXT_DOMAIN = 'disable-ibus-manager'

const { GLib, IBus } = imports.gi
const { extensionUtils: ExtensionUtils, ibusManager } = imports.misc
const Signals = imports.signals
const _ = ExtensionUtils.gettext

class DummyPanelService {
  destroy() {}
}
Signals.addSignalMethods(DummyPanelService.prototype)

class Extension {
  constructor(uuid) {
    this._uuid = uuid
    this.ibusManager = ibusManager.getIBusManager()

    ExtensionUtils.initTranslations(GETTEXT_DOMAIN)
  }

  enable() {
    log('"disable IBus manager" started')
    const mgr = this.ibusManager

    // Notable code path in https://github.com/GNOME/gnome-shell/blob/42.6/js/misc/ibusManager.js:
    // * IBusManager::constructor
    // * _queueSpawn -> _spawn
    // * `this._ibus.connect('connected', this._onConnected.bind(this));`
    // * _onConnected
    //   * _initEngines
    //   * _initPanelService
    //     * request_name_async(IBus.SERVICE_PANEL)  -- resource allocated here
    //     * `this._panelService = new IBus.PanelService` ...
    //     * `this._candidatePopup.setPanelService` ...

    this.patchIBusManager({
      _initPanelService: function() {
        log('dummy _initPanelService is called')
      },
      _updateReadiness: function() {
        log('patched _updateReadiness is called')
        this._ready = this._engines.size > 0
        this.emit('ready', this._ready)
      },
    })

    function _ensurePanelSrv() {
      mgr._panelService = new DummyPanelService()
      mgr._candidatePopup.setPanelService(mgr._panelService)
    }

    // runs AFTER `_clear` is called, and panelService is null then
    this.ibusDisconnHdlId = mgr._ibus.connect_after('disconnected', _ensurePanelSrv)

    mgr._ibus.release_name(IBus.SERVICE_PANEL)
    _ensurePanelSrv()

    log('"disable IBus manager" finished the job. You may need to restart ibus with "ibus-daemon -r".')

    this.respawnIBus()
  }

  disable() {
    log('"disable IBus manager" is being disabled')
    const mgr = this.ibusManager

    this.unpatchIBusManager()

    try {
        mgr.disconnect(this.ibusDisconnHdlId)
    } catch (err) {
        logError(err)
    }

    // re-spawn ibus process to kick everything off as normal
    mgr._queueSpawn()
  }

  patchIBusManager(obj) {
    const mgr = this.ibusManager
    this._oldFns = this._oldFns || {}

    Object.entries(obj).forEach(([key, fn]) => {
      const oldFn = mgr[key]
      if (oldFn == null) {
        log('""' + ' cannot be found on ibus manager. The extension might not work correctly.')
      }
      this._oldFns[key] = mgr[key]
      mgr[key] = fn || (() => {})
    })
  }

  unpatchIBusManager() {
    const mgr = this.ibusManager
    Object.entries(this._oldFns).forEach(([key, fn]) => {
      mgr[key] = fn
    })
  }

  respawnIBus() {
    // TODO...
  }
}

function init(meta) {
  return new Extension(meta.uuid)
}
