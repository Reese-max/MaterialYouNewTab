"""Real temporary Firefox add-on smoke; no signature/security preferences changed."""
import json, os, shutil, tempfile, time
from pathlib import Path
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait

root=Path(__file__).resolve().parent.parent
with tempfile.TemporaryDirectory(prefix='mynt-firefox-') as temp:
    addon=Path(temp)/'extension'
    shutil.copytree(root,addon,ignore=shutil.ignore_patterns('.git','.github','tools','dist'))
    shutil.copyfile(addon/'manifest(firefox).json',addon/'manifest.json')
    options=webdriver.FirefoxOptions()
    if os.environ.get('FIREFOX_BIN'): options.binary_location=os.environ['FIREFOX_BIN']
    driver=webdriver.Firefox(options=options)
    try:
        installed=driver.install_addon(str(addon),temporary=True)
        expected=json.loads((addon/'manifest.json').read_text())['browser_specific_settings']['gecko']['id']
        assert installed==expected
        driver.get('about:newtab')
        wait=WebDriverWait(driver,30)
        wait.until(lambda d:d.execute_script("return location.protocol==='moz-extension:' && !!window.myntLayout"))
        url=driver.current_url
        assert driver.execute_script('return document.documentElement.lang')=='zh-TW'
        assert driver.find_elements(By.CSS_SELECTOR,'#shortcutsContainer .shortcuts')
        driver.find_element(By.ID,'scratchpadCont').click()
        note=driver.find_element(By.ID,'scratchpadInput');note.clear();note.send_keys('Firefox verification note')
        driver.find_element(By.ID,'scratchpadCont').click()
        driver.find_element(By.ID,'myntLayoutEdit').click()
        handle=driver.find_element(By.CSS_SELECTOR,'[data-block="search"] .myntLayoutMove')
        x=driver.execute_script("return document.querySelector('.searchbar').getBoundingClientRect().x")
        handle.send_keys(Keys.ARROW_RIGHT)
        moved=driver.execute_script("return document.querySelector('.searchbar').getBoundingClientRect().x")
        assert abs(moved-x-1)<.1,(x,moved)
        driver.find_element(By.ID,'myntLayoutSave').click();driver.refresh()
        wait.until(lambda d:d.execute_script('return !!window.myntLayout'))
        assert driver.find_element(By.ID,'scratchpadInput').get_attribute('value')=='Firefox verification note'
        assert abs(driver.execute_script("return document.querySelector('.searchbar').getBoundingClientRect().x")-moved)<.1
        assert driver.execute_script('return window.myntLayout.get().locked')
        driver.set_window_size(580,900)
        wait.until(lambda d:d.execute_script('return innerWidth<900'))
        assert driver.execute_script('return document.documentElement.scrollWidth<=innerWidth')
        driver.set_window_size(1280,900)
        print(json.dumps({'status':'FIREFOX_EXTENSION_SMOKE_OK','browserVersion':driver.capabilities['browserVersion'],'addonId':installed,'newTabUrl':url,'realTemporaryInstall':True,'onePixelSaveReload':True,'scratchpadPersisted':True,'narrowNoOverflow':True}))
    finally:
        driver.quit()
